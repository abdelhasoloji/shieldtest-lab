import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateL3Scenario } from '../l3/scenario-model.mjs';
import { profileDigest } from '../l3/digest.mjs';
import { signCampaignToken, createNonceRegistry } from '../l3/campaign-token.mjs';
import { createSpoofRunRegistry } from '../l3/run-registry.mjs';
import { runSpoofCampaign } from '../l3/orchestrator.mjs';

const SECRET = 'orchestrator-secret-0123456789';
const NOW = Date.parse('2026-09-14T00:00:00Z');

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

function token(over = {}) {
  return signCampaignToken(
    {
      campaignId: 'camp-1', profileId: 'udp-spoofed-constant', profileDigest: profileDigest('udp-spoofed-constant'),
      targetId: 'synthetic-target-a', sourcePoolId: 'documentation-pool-a',
      pps: 100, durationSec: 10, packetSize: 128, approver: 'ciso@wedos', nonce: 'n-1', expiresAt: '2030-01-01T00:00:00Z',
      ...over,
    },
    SECRET,
  );
}

function safeProbes(over = {}) {
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

function base(over = {}) {
  return {
    scenario,
    token: token(),
    secret: SECRET,
    env: { LAB_SPOOFING_ENABLED: '1' },
    backend: 'namespace-sim',
    interfaceAllowlist: ['lab-test-a'],
    probes: safeProbes(),
    nonces: createNonceRegistry(),
    runRegistry: createSpoofRunRegistry(),
    now: NOW,
    seed: 3,
    ...over,
  };
}

test('all gates pass → COMPLETED simulation, slot released, nothing really emitted', async () => {
  const reg = createSpoofRunRegistry();
  const v = await runSpoofCampaign(base({ runRegistry: reg }));
  assert.equal(v.outcome, 'COMPLETED');
  assert.equal(v.kind, 'l3-spoof');
  assert.equal(v.simulated, true);
  assert.equal(v.confinement.decision, 'GO');
  assert.equal(v.packets.emitted, 1000);
  assert.equal(v.killSwitch.tripped, false);
  assert.equal(reg.isActive(), false, 'the single-campaign slot is released');
});

test('the dry-run backend blocks nothing and emits nothing', async () => {
  const v = await runSpoofCampaign(base({ backend: 'dry-run' }));
  assert.equal(v.outcome, 'DRY_RUN');
  assert.equal(v.packets.emitted, 0);
});

test('Lock 1 refuses when spoofing is not enabled', async () => {
  const v = await runSpoofCampaign(base({ env: {} }));
  assert.equal(v.outcome, 'BLOCKED_BY_CONFIG');
});

test('a bad token is refused before any run', async () => {
  const v = await runSpoofCampaign(base({ secret: 'wrong-secret-0123456789' }));
  assert.equal(v.outcome, 'BLOCKED_BY_TOKEN');
});

test('a busy single-campaign slot blocks a second run', async () => {
  const reg = createSpoofRunRegistry();
  reg.claim('camp-1'); // already active
  const v = await runSpoofCampaign(base({ runRegistry: reg }));
  assert.equal(v.outcome, 'BLOCKED_BY_CONCURRENCY');
});

test('a NO_GO confinement preflight aborts and still releases the slot', async () => {
  const reg = createSpoofRunRegistry();
  const v = await runSpoofCampaign(base({ runRegistry: reg, probes: safeProbes({ interfaceHasDefaultRoute: () => true }) }));
  assert.equal(v.outcome, 'BLOCKED_BY_PREFLIGHT');
  assert.equal(v.confinement.decision, 'NO_GO');
  assert.equal(reg.isActive(), false);
});

test('the trex backend can never be selected for a run (refused at Lock 1)', async () => {
  // trex is not a RUNNABLE backend, so the config lock refuses it before any run.
  const v = await runSpoofCampaign(base({ backend: 'trex' }));
  assert.equal(v.outcome, 'BLOCKED_BY_CONFIG');
});
