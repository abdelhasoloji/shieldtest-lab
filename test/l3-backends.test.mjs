import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateL3Scenario } from '../l3/scenario-model.mjs';
import { profileDigest } from '../l3/digest.mjs';
import { getSourcePool, isAllowedSource } from '../lib/source-pool.mjs';
import { perSecondRates, sampleSources, buildEmissionPlan } from '../l3/backends/plan.mjs';
import { selectBackend, listBackends, createBackend } from '../l3/backends/index.mjs';

function scenario(profileId = 'udp-spoofed-constant', over = {}) {
  return validateL3Scenario({
    schemaVersion: 1,
    profileId,
    sourcePoolId: 'documentation-pool-a',
    targetId: 'synthetic-target-a',
    protocol: profileId.startsWith('tcp') ? 'tcp' : 'udp',
    destinationPort: 9002,
    packetSize: 128,
    pps: 100,
    durationSec: 10,
    approval: { campaignId: 'c', profileDigest: profileDigest(profileId), expiresAt: '2030-01-01T00:00:00Z' },
    ...over,
  });
}

test('perSecondRates shapes each strategy, always ≤ pps and ≥ 1', () => {
  assert.deepEqual(perSecondRates('constant', 50, 3), [50, 50, 50]);
  const ramp = perSecondRates('ramp', 100, 5);
  assert.equal(ramp.length, 5);
  assert.ok(ramp[0] < ramp[4] && ramp.every((v) => v >= 1 && v <= 100));
  const burst = perSecondRates('burst', 100, 4);
  assert.ok(burst[0] === 100 && burst[1] < 100);
});

test('sampleSources yields distinct, in-pool, deterministic hosts', () => {
  const pool = getSourcePool('documentation-pool-a');
  const a = sampleSources(pool, 50, 7);
  const b = sampleSources(pool, 50, 7);
  assert.deepEqual(a, b, 'deterministic for a seed');
  assert.equal(new Set(a).size, a.length, 'distinct');
  assert.ok(a.every((ip) => isAllowedSource(ip, 'documentation-pool-a')), 'all in pool');
  // Capped at the pool host count.
  assert.ok(sampleSources(pool, 100000, 1).length <= pool.hostMax - pool.hostMin + 1);
});

test('buildEmissionPlan totals match the per-second rates', () => {
  const plan = buildEmissionPlan(scenario());
  assert.equal(plan.seconds.length, 10);
  assert.equal(plan.totalPackets, 1000); // constant 100 × 10
  assert.equal(plan.totalBytes, 1000 * 128);
});

test('only dry-run and namespace-sim are runnable; trex is registered but disabled', () => {
  const list = listBackends();
  assert.deepEqual(
    list.find((b) => b.id === 'trex'),
    { id: 'trex', runnable: false },
  );
  assert.equal(selectBackend('dry-run').runnable, true);
  assert.equal(selectBackend('namespace-sim').runnable, true);
  assert.throws(() => selectBackend('raw'), /unknown backend/);
});

test('dry-run emits nothing but reports the plan', async () => {
  const r = await createBackend('dry-run').run(scenario());
  assert.equal(r.simulated, false);
  assert.equal(r.emittedPackets, 0);
  assert.equal(r.emittedBytes, 0);
  assert.equal(r.plannedPackets, 1000);
});

test('namespace-sim models the stream through the egress guard (all conforming accepted)', async () => {
  const r = await createBackend('namespace-sim').run(scenario(), { seed: 3 });
  assert.equal(r.simulated, true);
  assert.equal(r.emittedPackets, 1000, 'conforming packets are accepted by the guard');
  assert.equal(r.droppedByGuard, 0);
  assert.ok(r.distinctSources > 1 && r.distinctSources <= 254); // /24 pool: ≤ 254 usable hosts
  assert.equal(r.peakPps, 100);
  // Deterministic for a seed.
  const r2 = await createBackend('namespace-sim').run(scenario(), { seed: 3 });
  assert.equal(r2.distinctSources, r.distinctSources);
});

test('trex refuses to run and to emit', async () => {
  await assert.rejects(() => createBackend('trex').run(scenario()), /disabled/);
  assert.throws(() => selectBackend('trex').emit(), /disabled and cannot emit/);
});

test('stop() halts the simulation cooperatively before emitting', async () => {
  const b = createBackend('namespace-sim');
  b.stop();
  const r = await b.run(scenario(), { seed: 1 });
  assert.equal(r.stoppedEarly, true);
  assert.equal(r.emittedPackets, 0);
});

test('createBackend is fail-closed on an unknown backend', () => {
  assert.throws(() => createBackend('nope'), /unknown backend/);
});
