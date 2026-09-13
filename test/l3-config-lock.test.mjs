import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateL3Scenario } from '../l3/scenario-model.mjs';
import { evaluateConfigLock } from '../l3/config-lock.mjs';
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

function opts(over = {}) {
  return {
    env: { LAB_SPOOFING_ENABLED: '1' },
    backend: 'dry-run',
    interfaceAllowlist: ['lab-test-a'],
    now: Date.parse('2025-01-01T00:00:00Z'),
    ...over,
  };
}

const lock = (r, id) => r.locks.find((l) => l.id === id);

test('all conditions met → allowed', () => {
  const r = evaluateConfigLock(scenario(), opts());
  assert.equal(r.allowed, true, JSON.stringify(r.locks.filter((l) => !l.ok)));
});

test('LAB_SPOOFING_ENABLED must equal "1"', () => {
  assert.equal(lock(evaluateConfigLock(scenario(), opts({ env: {} })), 'spoofing-enabled').ok, false);
  assert.equal(evaluateConfigLock(scenario(), opts({ env: { LAB_SPOOFING_ENABLED: 'true' } })).allowed, false);
});

test('only a runnable backend passes; trex is disabled', () => {
  assert.equal(evaluateConfigLock(scenario(), opts({ backend: 'namespace-sim' })).allowed, true);
  const trex = evaluateConfigLock(scenario(), opts({ backend: 'trex' }));
  assert.equal(lock(trex, 'backend-selected-and-runnable').ok, false);
  assert.match(lock(trex, 'backend-selected-and-runnable').detail, /disabled/);
  assert.equal(lock(evaluateConfigLock(scenario(), opts({ backend: 'raw' })), 'backend-selected-and-runnable').ok, false);
});

test('an expired approval fails', () => {
  const r = evaluateConfigLock(scenario({ approval: { campaignId: 'c', profileDigest: profileDigest('udp-spoofed-constant'), expiresAt: '2020-01-01T00:00:00Z' } }), opts());
  assert.equal(lock(r, 'approval-present-and-unexpired').ok, false);
});

test('a wrong profile digest fails', () => {
  const r = evaluateConfigLock(scenario({ approval: { campaignId: 'c', profileDigest: 'b'.repeat(64), expiresAt: '2030-01-01T00:00:00Z' } }), opts());
  assert.equal(lock(r, 'profile-digest-matches').ok, false);
});

test('interface must be on the local allowlist', () => {
  const r = evaluateConfigLock(scenario(), opts({ interfaceAllowlist: [] }));
  assert.equal(lock(r, 'interface-allowlisted').ok, false);
});

test('no scenario is a hard fail-closed', () => {
  assert.equal(evaluateConfigLock(null, opts()).allowed, false);
});
