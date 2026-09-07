import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConsole } from '../console/server.mjs';

const start = (c) => new Promise((r) => c.start((port) => r(port)));
const stop = (c) => new Promise((r) => c.stop(r));

async function withConsole(fn) {
  const c = createConsole({ LAB_CONSOLE_HOST: '127.0.0.1', LAB_CONSOLE_PORT: '0' });
  const port = await start(c);
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await stop(c);
  }
}

test('refuses a non-loopback bind unless explicitly allowed', () => {
  assert.throws(() => createConsole({ LAB_CONSOLE_HOST: '0.0.0.0' }), /not a loopback address/);
  // The explicit override is accepted (isolated-network escape hatch).
  assert.doesNotThrow(() =>
    createConsole({ LAB_CONSOLE_HOST: '0.0.0.0', LAB_CONSOLE_ALLOW_NONLOOPBACK: '1' }),
  );
});

test('serves the console page and a scenario list', async () => {
  await withConsole(async (base) => {
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /ShieldTest Lab — Console/);

    const list = await (await fetch(base + '/api/scenarios')).json();
    assert.ok(Array.isArray(list) && list.length >= 4);
    const mix = list.find((s) => s.name === 'multi-profile-mix');
    assert.ok(mix && mix.generators === 3 && mix.profiles.includes('dns'));
  });
});

test('POST /api/run rejects anything but a named scenario (no arbitrary target)', async () => {
  await withConsole(async (base) => {
    const bad = await fetch(base + '/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scenario: 'nope', target: 'https://example.com', pps: 999999 }),
    });
    assert.equal(bad.status, 400);
  });
});

test('SSE run-stream emits samples then a done event carrying the verdict', async () => {
  await withConsole(async (base) => {
    // amplification-ramp is short; read the raw SSE stream and parse events.
    const res = await fetch(base + '/api/run-stream?scenario=amplification-ramp');
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /event: sample/);
    assert.match(text, /event: done/);
    const doneLine = text.split('\n\n').find((b) => b.includes('event: done'));
    const json = JSON.parse(doneLine.split('data: ')[1]);
    assert.equal(json.scenario, 'amplification-ramp');
    assert.equal(json.verdict.class, 'C');
    assert.ok(json.verdict.amplificationFactor >= 1);
  });
});

test('unknown scenario on the stream yields an error event', async () => {
  await withConsole(async (base) => {
    const res = await fetch(base + '/api/run-stream?scenario=nope');
    const text = await res.text();
    assert.match(text, /event: error/);
  });
});
