import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConsole } from '../console/server.mjs';
import { PAGE } from '../console/ui.mjs';

// End-to-end tests for the loopback console: they start the real HTTP server on
// an ephemeral port and drive it exactly as the browser does (fetch + SSE +
// POST). They cover the happy path, every guarded error path, concurrency, and
// the on-screen coherence invariants the UI relies on.

const start = (c) => new Promise((r) => c.start((port) => r(port)));
const stop = (c) => new Promise((r) => c.stop(r));
const JSON_HEADERS = { 'content-type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withConsole(fn) {
  const c = createConsole({ LAB_CONSOLE_HOST: '127.0.0.1', LAB_CONSOLE_PORT: '0' });
  const port = await start(c);
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await stop(c);
  }
}

/** Parse an SSE text blob into [{event, data}] with data JSON-decoded. */
function parseSse(text) {
  return text
    .split('\n\n')
    .filter((b) => b.includes('event:'))
    .map((b) => {
      const event = (b.match(/event: (.*)/) || [])[1];
      const dataLine = (b.match(/data: (.*)/) || [])[1];
      return { event, data: dataLine ? JSON.parse(dataLine) : null };
    });
}

// --- bind safety -----------------------------------------------------------

test('refuses a non-loopback bind unless explicitly allowed', () => {
  assert.throws(() => createConsole({ LAB_CONSOLE_HOST: '0.0.0.0' }), /not a loopback address/);
  assert.doesNotThrow(() =>
    createConsole({ LAB_CONSOLE_HOST: '0.0.0.0', LAB_CONSOLE_ALLOW_NONLOOPBACK: '1' }),
  );
});

// --- static contract -------------------------------------------------------

test('serves the console page, health, and a scenario list', async () => {
  await withConsole(async (base) => {
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(await page.text(), /ShieldTest Lab — Console/);

    const health = await (await fetch(base + '/api/health')).json();
    assert.equal(health.ok, true);
    assert.ok(health.scenarios >= 4);

    const list = await (await fetch(base + '/api/scenarios')).json();
    assert.ok(Array.isArray(list));
    assert.equal(list.length, health.scenarios);
    const mix = list.find((s) => s.name === 'multi-profile-mix');
    assert.ok(mix && mix.generators === 3 && mix.profiles.includes('dns'));
    // describe() must expose only non-secret shape fields.
    for (const s of list) {
      assert.deepEqual(
        Object.keys(s).sort(),
        ['generators', 'name', 'profiles', 'strategy', 'summary', 'useScrubber', 'withLegit'].sort(),
      );
    }
  });
});

test('an unknown path returns 404', async () => {
  await withConsole(async (base) => {
    const res = await fetch(base + '/api/nope');
    assert.equal(res.status, 404);
  });
});

// --- POST guards (no arbitrary target off the wire) ------------------------

test('POST /api/run rejects a non-named scenario', async () => {
  await withConsole(async (base) => {
    const res = await fetch(base + '/api/run', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ scenario: 'nope', target: 'https://example.com', pps: 999999 }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/run rejects invalid JSON', async () => {
  await withConsole(async (base) => {
    const res = await fetch(base + '/api/run', { method: 'POST', headers: JSON_HEADERS, body: '{not json' });
    assert.equal(res.status, 400);
  });
});

test('POST /api/run rejects an oversized body (413)', async () => {
  await withConsole(async (base) => {
    const res = await fetch(base + '/api/run', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ scenario: 'x'.repeat(5000) }),
    });
    assert.equal(res.status, 413);
  });
});

// --- SSE run + concurrency + coherence (one real run) ----------------------

test('SSE run streams samples then a coherent class-C verdict, and blocks a concurrent run', async () => {
  await withConsole(async (base) => {
    // Start a real run and read its stream. mixed-flood-with-legit exercises the
    // scrubber, two synthetic profiles, and benign traffic, so every panel the
    // UI renders is populated.
    const streamRes = await fetch(base + '/api/run-stream?scenario=mixed-flood-with-legit');
    assert.equal(streamRes.status, 200);
    assert.match(streamRes.headers.get('content-type'), /text\/event-stream/);

    // While that run is in progress the console must refuse a second one.
    await sleep(80);
    const busy = await fetch(base + '/api/run', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ scenario: 'amplification-ramp' }),
    });
    assert.equal(busy.status, 409);

    const events = parseSse(await streamRes.text());
    const samples = events.filter((e) => e.event === 'sample');
    const done = events.find((e) => e.event === 'done');
    assert.ok(samples.length > 0, 'stream carried live samples');
    assert.ok(done, 'stream ended with a done event');

    const summary = done.data;
    const v = summary.verdict;

    // Verdict shape.
    assert.equal(v.class, 'C');
    assert.equal(v.scenario, 'mixed-flood-with-legit');
    assert.ok(v.amplificationFactor >= 1);

    // On-screen coherence invariant: the per-profile requests must sum to the
    // reflector's total request count shown in the tiles/verdict.
    const perProfile = summary.perProfile || {};
    assert.ok(Object.keys(perProfile).length >= 2, 'multi-profile run has a per-profile breakdown');
    const sumRequests = Object.values(perProfile).reduce((a, b) => a + (b.requests || 0), 0);
    assert.equal(sumRequests, v.requests, 'Σ per-profile requests == verdict.requests');
    // Amplification means output bytes exceed input bytes for every profile.
    for (const b of Object.values(perProfile)) {
      assert.ok(b.outputBytes >= b.inputBytes, 'per-profile output bytes >= input bytes');
    }

    // Outcome must be derived exactly from the mitigation signal (same rule the
    // UI badge uses): collateral above 5% => MITIGATED_WITH_COLLATERAL.
    if (v.mitigation && v.mitigation.engaged) {
      const collateral = v.mitigation.collateralPct || 0;
      assert.equal(
        v.outcome,
        collateral > 5 ? 'MITIGATED_WITH_COLLATERAL' : 'MITIGATED',
        'outcome matches the collateral threshold',
      );
    }
  });
});

test('unknown scenario on the stream yields an error event (no run started)', async () => {
  await withConsole(async (base) => {
    const res = await fetch(base + '/api/run-stream?scenario=nope');
    const events = parseSse(await res.text());
    assert.ok(events.some((e) => e.event === 'error'));
    assert.ok(!events.some((e) => e.event === 'sample'));
  });
});

test('POST /api/run returns a class-C verdict for a named scenario', async () => {
  await withConsole(async (base) => {
    const res = await fetch(base + '/api/run', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ scenario: 'udp_dns_reflection' }),
    });
    assert.equal(res.status, 200);
    const summary = await res.json();
    assert.equal(summary.verdict.class, 'C');
    assert.ok(summary.verdict.amplificationFactor >= 1);
  });
});

// --- UI truthfulness safeguards ship in the page ---------------------------

test('the console page ships the truthfulness safeguards', () => {
  // A stalled/unreachable backend must never leave the panel stuck on "running…".
  assert.match(PAGE, /armWatchdog/);
  assert.match(PAGE, /function finishRun/);
  assert.match(PAGE, /STALL_MS/);
  // init() must surface a backend-unreachable state instead of an empty console.
  assert.match(PAGE, /backend unreachable/);
});
