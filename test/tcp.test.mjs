import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTcpTarget } from '../tcp-target/receiver.mjs';
import { runTcpGenerator } from '../tcp-generator/generate.mjs';
import { runScenario } from '../run-scenario.mjs';

const start = (c) => new Promise((r) => c.start((port) => r(port)));
const stop = (c) => new Promise((r) => c.stop(r));

test('tcp-generator refuses a public target (hard no-spoof/lab gate)', () => {
  assert.throws(
    () => runTcpGenerator({ TARGET_HOST: '8.8.8.8', TARGET_PORT: '9003' }),
    /private\/loopback/,
  );
});

test('tcp target sheds connections once the state table is full (saturation measured)', async () => {
  const target = createTcpTarget({ LISTEN_HOST: '127.0.0.1', LISTEN_PORT: '0', CAPACITY: '10' });
  const port = await start(target);
  try {
    await runTcpGenerator({
      TARGET_HOST: '127.0.0.1',
      TARGET_PORT: String(port),
      LAB_CIDR_PREFIX: '127.0.0.',
      RATE_CPS: 200,
      DURATION_SEC: 1,
      HOLD_MS: 5000, // hold so concurrency exceeds CAPACITY
    });
    assert.ok(target.metrics.accepted > 0, 'some connections accepted');
    assert.ok(target.metrics.refused > 0, 'connections shed once the table was full');
    assert.ok(target.metrics.saturationPct > 0, 'saturation measured');
    assert.ok(target.metrics.concurrentPeak <= 10, 'concurrency never exceeds capacity');
  } finally {
    await stop(target);
  }
});

test('tcp_synflood scenario runs and yields a class-C tcp verdict', async () => {
  const s = await runScenario('tcp_synflood', {
    target: { CAPACITY: 20 },
    generator: { RATE_CPS: 200, DURATION_SEC: 1, HOLD_MS: 5000 },
  });
  assert.equal(s.kind, 'tcp');
  assert.ok(s.target.accepted > 0);
  assert.equal(s.verdict.class, 'C');
  assert.equal(s.verdict.kind, 'tcp-connection-pressure');
  assert.ok(['STATE_TABLE_SATURATED', 'ABSORBED'].includes(s.verdict.outcome));
  assert.ok(typeof s.verdict.connections.saturationPct === 'number');
});
