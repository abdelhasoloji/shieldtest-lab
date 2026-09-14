import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  L3_PROFILES,
  L3_ABSOLUTE_CEILING,
  getProfile,
  listProfiles,
} from '../l3/profiles.mjs';
import { getProfile as getProfileViaRegistry } from '../l3/registry.mjs';
import { profileDigest } from '../l3/digest.mjs';

const IDS = ['udp-spoofed-constant', 'udp-spoofed-ramp', 'udp-spoofed-burst', 'tcp-syn-spoofed-model'];

test('the four V1 profiles exist and are frozen', () => {
  assert.equal(Object.isFrozen(L3_PROFILES), true);
  for (const id of IDS) {
    assert.ok(L3_PROFILES[id], `${id} present`);
    assert.equal(Object.isFrozen(L3_PROFILES[id]), true);
  }
  assert.equal(listProfiles().length, 4);
});

test('every profile stays within the global absolute ceiling', () => {
  const c = L3_ABSOLUTE_CEILING;
  for (const id of IDS) {
    const p = L3_PROFILES[id];
    assert.ok(p.absMaxPps > 0 && p.absMaxPps <= c.maxPps, `${id} pps`);
    assert.ok(p.absMaxDurationSec > 0 && p.absMaxDurationSec <= c.maxDurationSec, `${id} duration`);
    assert.ok(p.absMaxPacketSize > 0 && p.absMaxPacketSize <= c.maxPacketSize, `${id} size`);
    assert.ok(p.absMaxSources > 0 && p.absMaxSources <= c.maxSources, `${id} sources`);
  }
});

test('defaults are low and never exceed the profile cap; no infinite runs', () => {
  for (const id of IDS) {
    const p = L3_PROFILES[id];
    assert.ok(p.defaultPps > 0 && p.defaultPps <= 20, `${id} default is low`);
    assert.ok(p.defaultPps <= p.absMaxPps, `${id} default ≤ cap`);
    assert.ok(Number.isFinite(p.absMaxDurationSec) && p.absMaxDurationSec > 0, `${id} finite duration cap`);
  }
});

test('each profile documents a usage reason and expected metrics', () => {
  for (const id of IDS) {
    const p = L3_PROFILES[id];
    assert.ok(typeof p.reason === 'string' && p.reason.length > 10, `${id} reason`);
    assert.ok(Array.isArray(p.expectedMetrics) && p.expectedMetrics.length > 0, `${id} metrics`);
    assert.ok(['low', 'medium', 'high'].includes(p.riskLevel), `${id} risk`);
  }
});

test('the TCP profile is a saturation MODEL — no evasion/scan/dynamic targeting', () => {
  const p = L3_PROFILES['tcp-syn-spoofed-model'];
  assert.equal(p.protocol, 'tcp');
  assert.deepEqual([...p.notModeled].sort(), ['dynamic-target-selection', 'evasion', 'scan']);
  assert.match(p.reason, /no evasion, no scan, no dynamic target selection/i);
});

test('getProfile is fail-closed and re-exported from the registry', () => {
  assert.equal(getProfile('udp-spoofed-ramp').rampStrategy, 'ramp');
  assert.throws(() => getProfile('nope'), /unknown profile/);
  // The registry re-export points at the same authoritative profile.
  assert.equal(getProfileViaRegistry('udp-spoofed-ramp').id, 'udp-spoofed-ramp');
});

test('profile digests stay deterministic and distinct (approvals remain valid)', () => {
  for (const id of IDS) assert.match(profileDigest(id), /^[a-f0-9]{64}$/);
  const digests = new Set(IDS.map(profileDigest));
  assert.equal(digests.size, IDS.length, 'each profile has a distinct digest');
});
