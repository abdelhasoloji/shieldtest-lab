import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateL3Scenario } from '../l3/scenario-model.mjs';
import {
  buildEgressPolicy,
  createEgressGuard,
  renderNftRules,
  applyEgressPolicy,
} from '../l3/egress-guard.mjs';
import { profileDigest } from '../l3/digest.mjs';

function scenario(over = {}) {
  return validateL3Scenario({
    schemaVersion: 1,
    profileId: 'udp-spoofed-constant',
    sourcePoolId: 'documentation-pool-a',
    targetId: 'synthetic-target-a',
    protocol: 'udp',
    destinationPort: 9002,
    packetSize: 128,
    pps: 100,
    durationSec: 10,
    approval: { campaignId: 'c', profileDigest: profileDigest('udp-spoofed-constant'), expiresAt: '2030-01-01T00:00:00Z' },
    ...over,
  });
}

test('policy is derived from the scenario (dest, pool, pps/bps caps)', () => {
  const p = buildEgressPolicy(scenario());
  assert.equal(p.destIp, '192.168.100.99');
  assert.equal(p.destPort, 9002);
  assert.equal(p.protocol, 'udp');
  assert.equal(p.sourcePoolId, 'documentation-pool-a');
  assert.equal(p.ppsCap, 100);
  assert.equal(p.bpsCap, 100 * 128 * 8);
  assert.equal(p.defaultAction, 'DROP');
});

test('accepts a conforming packet, drops each non-conformance with a reason', () => {
  const g = createEgressGuard(buildEgressPolicy(scenario()));
  const base = { srcIp: '192.0.2.5', dstIp: '192.168.100.99', dstPort: 9002, protocol: 'udp', bytes: 128 };
  assert.equal(g.classify(base, 1000).action, 'ACCEPT');
  assert.equal(g.classify({ ...base, protocol: 'tcp' }, 1000).reason, 'protocol-mismatch');
  assert.equal(g.classify({ ...base, dstIp: '192.168.100.98' }, 1000).reason, 'destination-mismatch');
  assert.equal(g.classify({ ...base, dstPort: 9003 }, 1000).reason, 'port-mismatch');
  assert.equal(g.classify({ ...base, srcIp: '8.8.8.8' }, 1000).reason, 'source-not-in-pool');
  assert.equal(g.classify({ ...base, srcIp: '198.51.100.5' }, 1000).reason, 'source-not-in-pool');
  assert.equal(g.classify({ ...base, bytes: 129 }, 1000).reason, 'oversize');
  const snap = g.snapshot();
  assert.equal(snap.accepted, 1);
  assert.ok(snap.dropped >= 6);
});

test('drops beyond the pps cap within a 1s window', () => {
  const g = createEgressGuard(buildEgressPolicy(scenario({ pps: 10, packetSize: 64 })));
  const pkt = { srcIp: '192.0.2.9', dstIp: '192.168.100.99', dstPort: 9002, protocol: 'udp', bytes: 64 };
  let accepted = 0;
  for (let i = 0; i < 20; i++) if (g.classify(pkt, 5000).action === 'ACCEPT') accepted += 1;
  // ~10/s (× small tolerance), never all 20.
  assert.ok(accepted <= 11, `accepted ${accepted}`);
  assert.ok(g.snapshot().dropReasons['pps-cap'] > 0);
  // A later window admits again.
  assert.equal(g.classify(pkt, 7000).action, 'ACCEPT');
});

test('reset clears counters (guaranteed cleanup)', () => {
  const g = createEgressGuard(buildEgressPolicy(scenario()));
  g.classify({ srcIp: '192.0.2.5', dstIp: '192.168.100.99', dstPort: 9002, protocol: 'udp', bytes: 64 }, 1);
  g.reset();
  assert.deepEqual(g.snapshot(), { accepted: 0, acceptedBytes: 0, dropped: 0, dropReasons: {}, defaultAction: 'DROP' });
});

test('nft renderer is default-drop and system adapter is a no-op unless enabled', () => {
  const p = buildEgressPolicy(scenario());
  const rules = renderNftRules(p);
  assert.match(rules, /policy drop;/);
  assert.match(rules, /ip daddr 192\.168\.100\.99 udp dport 9002/);
  // Default: not applied, returns the plan only.
  assert.equal(applyEgressPolicy(p).applied, false);
  // Enabled without an executor is fail-closed.
  assert.throws(() => applyEgressPolicy(p, { enabled: true }), /no exec executor/);
  // Enabled WITH an injected executor applies (used only outside CI).
  let got = '';
  const res = applyEgressPolicy(p, { enabled: true, exec: (plan) => { got = plan; } });
  assert.equal(res.applied, true);
  assert.match(got, /policy drop;/);
});
