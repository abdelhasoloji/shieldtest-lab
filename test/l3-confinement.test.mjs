import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateL3Scenario } from '../l3/scenario-model.mjs';
import { runConfinementPreflight } from '../l3/confinement.mjs';
import { profileDigest } from '../l3/digest.mjs';

const S = validateL3Scenario({
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
});

/** All-safe fake probes → GO. Override one to force a NO_GO. */
function probes(over = {}) {
  return {
    interfaceHasDefaultRoute: () => false,
    interfaceCanReachInternet: () => false,
    destinationDirectlyAttached: () => true,
    observedDestinationOnInterface: () => '192.168.100.99',
    managementInterfaceName: () => 'mgmt0',
    dockerNetworkIsInternal: () => true,
    watchdogActive: () => true,
    captureReady: () => true,
    previousStateClean: () => true,
    anotherSpoofCampaignActive: () => false,
    ...over,
  };
}

test('all-safe observations yield a GO certificate with every check ok', async () => {
  const cert = await runConfinementPreflight(S, probes());
  assert.equal(cert.decision, 'GO');
  assert.equal(cert.kind, 'shieldtest.l3.confinement-certificate/v1');
  assert.equal(cert.destination.ip, '192.168.100.99');
  assert.equal(cert.digest, S.approval.profileDigest);
  assert.ok(cert.checks.every((c) => c.ok));
  assert.equal(Object.isFrozen(cert), true);
});

test('any single dangerous observation forces NO_GO', async () => {
  const cases = [
    ['interfaceHasDefaultRoute', () => true, 'no-default-route'],
    ['interfaceCanReachInternet', () => true, 'no-internet-reach'],
    ['destinationDirectlyAttached', () => false, 'destination-attached'],
    ['observedDestinationOnInterface', () => '192.168.100.98', 'destination-matches-target'],
    ['dockerNetworkIsInternal', () => false, 'docker-network-internal'],
    ['watchdogActive', () => false, 'watchdog-active'],
    ['captureReady', () => false, 'capture-ready'],
    ['previousStateClean', () => false, 'previous-state-clean'],
    ['anotherSpoofCampaignActive', () => true, 'no-active-spoof-campaign'],
  ];
  for (const [name, fn, checkId] of cases) {
    const cert = await runConfinementPreflight(S, probes({ [name]: fn }));
    assert.equal(cert.decision, 'NO_GO', `${name} should force NO_GO`);
    assert.equal(cert.checks.find((c) => c.id === checkId)?.ok, false, `${checkId} should fail`);
  }
});

test('test interface equal to management interface forces NO_GO', async () => {
  const cert = await runConfinementPreflight(S, probes({ managementInterfaceName: () => 'lab-veth-a' }));
  assert.equal(cert.decision, 'NO_GO');
  assert.equal(cert.checks.find((c) => c.id === 'test-iface-not-management')?.ok, false);
});

test('a throwing probe fails its check (fail-closed), never GO', async () => {
  const cert = await runConfinementPreflight(S, probes({ watchdogActive: () => { throw new Error('boom'); } }));
  assert.equal(cert.decision, 'NO_GO');
  const c = cert.checks.find((x) => x.id === 'watchdog-active');
  assert.equal(c.ok, false);
  assert.match(c.detail, /probe error/);
});

test('missing probes object or a missing probe throws (fail-closed)', async () => {
  await assert.rejects(() => runConfinementPreflight(S, null), /requires an injected probes/);
  const { watchdogActive, ...incomplete } = probes();
  void watchdogActive;
  await assert.rejects(() => runConfinementPreflight(S, incomplete), /missing probe "watchdogActive"/);
});
