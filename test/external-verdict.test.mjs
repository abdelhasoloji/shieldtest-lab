import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyExternal, toExternalVerdict, EXTERNAL_VERDICT_SCHEMA } from '../external/verdict.mjs';
import { dispatchExternal } from '../external/run-external.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('classifyExternal maps the resilience signal', () => {
  assert.equal(classifyExternal({ opened: 100, errors: 0, goaway: true }), 'MITIGATED_GOAWAY');
  assert.equal(classifyExternal({ opened: 100, errors: 90, goaway: false }), 'DEGRADED');
  assert.equal(classifyExternal({ opened: 100, errors: 1, goaway: false }), 'ABSORBED');
  assert.equal(classifyExternal({ opened: 0, errors: 0, goaway: false }), 'INCONCLUSIVE');
});

test('toExternalVerdict carries schema, vector, measurement and no DRS letter', () => {
  const v = toExternalVerdict(
    { kind: 'http2-rapid-reset', target: 'bank.cz', opened: 50, resetsSent: 50, errors: 0, goaway: true, effective: { rps: 100 }, durationMs: 2000, effectiveRps: 25 },
    { authorizationRef: 'INTERNAL-TEST-WEDOS' },
  );
  assert.equal(v.schema, EXTERNAL_VERDICT_SCHEMA);
  assert.equal(v.vector, 'http2-rapid-reset');
  assert.equal(v.target, 'bank.cz');
  assert.equal(v.outcome, 'MITIGATED_GOAWAY');
  assert.equal(v.drsClass, null);
  assert.equal(v.measurement.streamsOpened, 50);
});

const writeRegistry = (obj) => {
  const f = path.join(os.tmpdir(), `authz-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(f, JSON.stringify(obj));
  return f;
};

test('dispatch is fail-closed without a registry file or target', async () => {
  await assert.rejects(dispatchExternal({ TARGET: 'bank.cz' }), /AUTHORIZED_TARGETS_FILE is required/);
  const f = writeRegistry({ targets: [] });
  await assert.rejects(dispatchExternal({ AUTHORIZED_TARGETS_FILE: f, TARGET: 'bank.cz' }), /fail-closed/);
});

test('dispatch refuses a target that is not authorized', async () => {
  const f = writeRegistry({ targets: [{ host: 'bank.cz', verification: { method: 'dns-txt', token: 't' }, window: 'always', caps: {} }] });
  await assert.rejects(dispatchExternal({ AUTHORIZED_TARGETS_FILE: f, TARGET: 'evil.example' }), /not on the authorized allowlist/);
});

test('dry-run authorizes + verifies control but sends NO traffic (default)', async () => {
  const f = writeRegistry({
    targets: [{ host: 'bank.cz', authorizationRef: 'REF-1', verification: { method: 'dns-txt', name: '_shieldtest.bank.cz', token: 'live-token' }, window: 'always', caps: { maxRps: 50, maxStreams: 100, maxDurationSec: 10, maxConcurrency: 8 } }],
  });
  const resolver = { resolveTxt: async () => [['live-token']] };
  const plan = await dispatchExternal({ AUTHORIZED_TARGETS_FILE: f, TARGET: 'bank.cz', RPS: '9999', STREAMS: '9999', DURATION_SEC: '9999' }, { resolver });
  assert.equal(plan.event, 'external.dry-run');
  assert.equal(plan.authorized, true);
  assert.equal(plan.controlVerified, true);
  assert.deepEqual(plan.effective, { rps: 50, streams: 100, durationSec: 10, concurrency: 8 });
});
