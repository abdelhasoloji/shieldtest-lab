import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateL3Scenario } from '../l3/scenario-model.mjs';
import { profileDigest } from '../l3/digest.mjs';
import { toL3SpoofVerdict, captureHash, L3_OUTCOMES } from '../l3/verdict.mjs';

const scenario = validateL3Scenario({
  schemaVersion: 1,
  profileId: 'udp-spoofed-constant',
  sourcePoolId: 'documentation-pool-a',
  targetId: 'synthetic-target-a',
  protocol: 'udp',
  destinationPort: 9002,
  packetSize: 128,
  pps: 100,
  durationSec: 10,
  approval: { campaignId: 'camp-1', profileDigest: profileDigest('udp-spoofed-constant'), expiresAt: '2030-01-01T00:00:00Z' },
});

test('a completed simulation verdict is class C, kind l3-spoof, and simulated', () => {
  const v = toL3SpoofVerdict({
    scenario,
    outcome: 'COMPLETED',
    startedAt: '2026-09-14T00:00:00Z',
    finishedAt: '2026-09-14T00:00:11Z',
    confinementCertificate: { decision: 'GO' },
    result: { plannedPackets: 1000, emittedPackets: 1000, emittedBytes: 128000, peakPps: 100, distinctSources: 42, droppedByGuard: 0, dropReasons: {} },
    killSwitch: { tripped: false, reason: null },
  });
  assert.equal(v.class, 'C');
  assert.equal(v.kind, 'l3-spoof');
  assert.equal(v.simulated, true);
  assert.equal(v.source, 'shieldtest-lab');
  assert.equal(v.scenario.campaignId, 'camp-1');
  assert.equal(v.packets.emitted, 1000);
  assert.equal(v.sources.distinct, 42);
  assert.equal(v.confinement.decision, 'GO');
  assert.match(v.captureSha256, /^[a-f0-9]{64}$/);
  assert.ok(L3_OUTCOMES.includes(v.outcome));
});

test('a dry-run verdict is not simulated and emits nothing', () => {
  const v = toL3SpoofVerdict({ scenario, outcome: 'DRY_RUN', result: { plannedPackets: 1000, emittedPackets: 0 } });
  assert.equal(v.simulated, false);
  assert.equal(v.packets.emitted, 0);
  assert.equal(v.packets.requested, 1000);
});

test('a blocked verdict carries the outcome and no emission', () => {
  const v = toL3SpoofVerdict({ scenario, outcome: 'BLOCKED_BY_PREFLIGHT', confinementCertificate: { decision: 'NO_GO' } });
  assert.equal(v.outcome, 'BLOCKED_BY_PREFLIGHT');
  assert.equal(v.simulated, null);
  assert.equal(v.confinement.decision, 'NO_GO');
  assert.equal(v.packets.emitted, 0);
});

test('captureHash is deterministic and order-independent', () => {
  assert.equal(captureHash({ a: 1, b: 2 }), captureHash({ b: 2, a: 1 }));
  assert.match(captureHash({}), /^[a-f0-9]{64}$/);
});
