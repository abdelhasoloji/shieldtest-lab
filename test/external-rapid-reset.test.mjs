import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createH2TestTarget } from '../external/h2-test-target.mjs';
import { runRapidReset } from '../external/rapid-reset.mjs';
import { loadRegistry } from '../lib/target-guard.mjs';

// A registry that authorizes ONLY the loopback test target (stands in for the
// real bank.cz entry). Everything else must be refused by the gate.
const registryFor = (port) =>
  loadRegistry({
    targets: [
      {
        host: '127.0.0.1',
        verification: { method: 'dns-txt', token: 'test' },
        window: 'always',
        caps: { maxRps: 100, maxStreams: 300, maxDurationSec: 5, maxConcurrency: 32 },
      },
    ],
  });

test('end to end: rapid-reset drives streams the target sees as resets', async () => {
  const target = createH2TestTarget({ LISTEN_HOST: '127.0.0.1', LISTEN_PORT: '0' });
  const { port } = await target.start();
  try {
    const summary = await runRapidReset({
      url: `http://127.0.0.1:${port}/`,
      registry: registryFor(port),
      requested: { rps: 100, streams: 200, durationSec: 2, concurrency: 32 },
    });
    assert.equal(summary.kind, 'http2-rapid-reset');
    assert.ok(summary.opened > 0, 'opened some streams');
    assert.equal(summary.resetsSent, summary.opened, 'every opened stream was reset');
    assert.ok(target.stats.streams > 0, 'target observed streams');
    assert.ok(target.stats.resets > 0, 'target observed RST_STREAM cancellations');
  } finally {
    await target.stop();
  }
});

test('the gate refuses a target that is not on the allowlist (fail-closed)', async () => {
  await assert.rejects(
    runRapidReset({ url: 'https://evil.example/', registry: registryFor(0), requested: { rps: 10, streams: 10, durationSec: 1 } }),
    /not on the authorized allowlist/,
  );
});

test('an empty registry authorizes nothing', async () => {
  await assert.rejects(
    runRapidReset({ url: 'http://127.0.0.1:1/', registry: new Map(), requested: { rps: 10, streams: 10, durationSec: 1 } }),
    /fail-closed/,
  );
});

test('requested intensity is clamped to the target caps', async () => {
  const target = createH2TestTarget({ LISTEN_HOST: '127.0.0.1', LISTEN_PORT: '0' });
  const { port } = await target.start();
  try {
    const summary = await runRapidReset({
      url: `http://127.0.0.1:${port}/`,
      registry: registryFor(port),
      requested: { rps: 99999, streams: 99999, durationSec: 99999, concurrency: 99999 },
    });
    assert.equal(summary.effective.rps, 100);
    assert.equal(summary.effective.streams, 300);
    assert.equal(summary.effective.durationSec, 5);
    assert.equal(summary.effective.concurrency, 32);
    assert.ok(summary.opened <= 300, 'never exceeds the stream cap');
  } finally {
    await target.stop();
  }
});
