import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processOne, configFromEnv } from '../runner.mjs';

const cfg = { apiUrl: 'http://cp.internal', token: 'tok', runnerId: 'r1' };

/** Minimal fetch stub: routes by URL suffix, records posted bodies. */
function makeFetch(routes, sink) {
  return async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    for (const [suffix, handler] of routes) {
      if (url.endsWith(suffix)) {
        sink.push({ url, body });
        return handler(body);
      }
    }
    throw new Error('unexpected url ' + url);
  };
}
const json = (status, obj) => ({ status, ok: status >= 200 && status < 300, json: async () => obj });

test('configFromEnv fails closed without endpoint + token', () => {
  assert.throws(() => configFromEnv({}), /required/);
  assert.throws(() => configFromEnv({ BENCH_API_URL: 'http://x' }), /required/);
  const c = configFromEnv({ BENCH_API_URL: 'http://x/', BENCH_RUNNER_TOKEN: 't' });
  assert.equal(c.apiUrl, 'http://x'); // trailing slash trimmed
  assert.equal(c.token, 't');
});

test('processOne returns null when the queue is empty (204)', async () => {
  const calls = [];
  const fetchImpl = makeFetch([['/claim', () => json(204, null)]], calls);
  const r = await processOne({ ...cfg, fetchImpl });
  assert.equal(r, null);
  assert.equal(calls.length, 1);
});

test('processOne executes a claimed run and posts a verdict (labTarget + runner tagged)', async () => {
  const calls = [];
  const fetchImpl = makeFetch(
    [
      ['/claim', () => json(200, { id: 'run-9', scenario: 'amplification-ramp', labTarget: 'bench.internal' })],
      ['/result', () => json(200, { status: 'COMPLETED' })],
    ],
    calls,
  );
  const runScenario = async (name) => ({
    scenario: name,
    verdict: { schema: 'shieldtest.lab.verdict/v1', class: 'C', scenario: name, outcome: 'MITIGATED', amplificationFactor: 40, labTarget: 'lab-target.internal' },
  });
  const r = await processOne({ ...cfg, fetchImpl, runScenario });
  assert.deepEqual(r, { id: 'run-9', scenario: 'amplification-ramp', outcome: 'MITIGATED' });
  const posted = calls.find((c) => c.url.endsWith('/result')).body;
  assert.equal(posted.verdict.class, 'C');
  assert.equal(posted.verdict.labTarget, 'bench.internal'); // overridden with the governed target
  assert.equal(posted.verdict.runner, 'r1');
});

test('processOne reports an execution error back to the control plane', async () => {
  const calls = [];
  const fetchImpl = makeFetch(
    [
      ['/claim', () => json(200, { id: 'run-x', scenario: 'wave-detection', labTarget: 'bench.internal' })],
      ['/result', () => json(200, { status: 'FAILED' })],
    ],
    calls,
  );
  const runScenario = async () => {
    throw new Error('boom');
  };
  const r = await processOne({ ...cfg, fetchImpl, runScenario });
  assert.equal(r.error, 'boom');
  const posted = calls.find((c) => c.url.endsWith('/result')).body;
  assert.equal(posted.error, 'boom');
  assert.equal(posted.verdict, undefined);
});
