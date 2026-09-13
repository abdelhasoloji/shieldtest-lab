import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateL3Scenario } from '../l3/scenario-model.mjs';

const DIGEST = 'a'.repeat(64);

/** A minimal VALID scenario (udp-spoofed-constant → synthetic-target-a). */
function valid(over = {}) {
  return {
    schemaVersion: 1,
    profileId: 'udp-spoofed-constant',
    sourcePoolId: 'documentation-pool-a',
    targetId: 'synthetic-target-a',
    protocol: 'udp',
    destinationPort: 9002,
    packetSize: 128,
    pps: 100,
    durationSec: 10,
    approval: {
      campaignId: 'c-1',
      profileDigest: DIGEST,
      expiresAt: '2030-01-01T00:00:00.000Z',
    },
    ...over,
  };
}

test('a valid scenario resolves addresses/interface FROM the registry', () => {
  const s = validateL3Scenario(valid());
  assert.equal(Object.isFrozen(s), true);
  assert.equal(s.resolved.targetIp, '192.168.100.99');
  assert.equal(s.interfaceId, 'lab-test-a');
  assert.equal(s.resolved.interfaceName, 'lab-veth-a');
  assert.equal(s.resolved.sourcePoolCidr, '192.0.2.0/24');
  // A sourceCount defaults to the min of profile/pool caps when omitted.
  assert.ok(s.sourceCount > 0 && s.sourceCount <= 256);
});

test('a raw-addressing / command / path field is a hard rejection', () => {
  for (const k of ['ip', 'host', 'hostname', 'url', 'cidr', 'sourceCidr', 'interface', 'command', 'args', 'path', 'route', 'gateway']) {
    assert.throws(() => validateL3Scenario(valid({ [k]: 'x' })), /forbidden field/, `${k} must be rejected`);
  }
  // 0.0.0.0/0 can't even be expressed — there is no CIDR/destination field.
  assert.throws(() => validateL3Scenario(valid({ destination: '0.0.0.0/0' })), /unknown field/);
});

test('unknown fields are rejected (fail-closed)', () => {
  assert.throws(() => validateL3Scenario(valid({ extra: 1 })), /unknown field/);
});

test('unknown referenced objects throw', () => {
  assert.throws(() => validateL3Scenario(valid({ profileId: 'nope' })), /unknown profile/);
  assert.throws(() => validateL3Scenario(valid({ sourcePoolId: 'nope' })), /unknown source pool/);
  assert.throws(() => validateL3Scenario(valid({ targetId: 'nope' })), /unknown target/);
});

test('protocol must match the profile', () => {
  assert.throws(() => validateL3Scenario(valid({ protocol: 'tcp' })), /does not match profile/);
});

test('ports must be unprivileged and allowed for the target/profile', () => {
  assert.throws(() => validateL3Scenario(valid({ destinationPort: 80 })), /unprivileged port/);
  assert.throws(() => validateL3Scenario(valid({ destinationPort: 9999 })), /not allowed for this target/);
});

test('requested load can never exceed the absolute profile caps', () => {
  assert.throws(() => validateL3Scenario(valid({ pps: 201 })), /exceeds the absolute cap/);
  assert.throws(() => validateL3Scenario(valid({ durationSec: 31 })), /exceeds the absolute cap/);
  assert.throws(() => validateL3Scenario(valid({ packetSize: 513 })), /exceeds the absolute cap/);
  assert.throws(() => validateL3Scenario(valid({ pps: 0 })), /positive integer/);
  // No infinite runs: durationSec must be a positive integer.
  assert.throws(() => validateL3Scenario(valid({ durationSec: 'inf' })), /positive integer/);
});

test('a real scenario cannot select a test-only target or pool', () => {
  assert.throws(
    () => validateL3Scenario(valid({ targetId: 'loopback-target', sourcePoolId: 'documentation-pool-a' })),
    /test-only/,
  );
  // …unless the unit-test opt-in is set.
  assert.doesNotThrow(() =>
    validateL3Scenario(valid({ targetId: 'loopback-target' }), { allowTestOnly: true }),
  );
});

test('the approval reference block is required and typed', () => {
  assert.throws(() => validateL3Scenario(valid({ approval: undefined })), /approval block is required/);
  assert.throws(() => validateL3Scenario(valid({ approval: { campaignId: '', profileDigest: DIGEST, expiresAt: '2030-01-01T00:00:00Z' } })), /campaignId/);
  assert.throws(() => validateL3Scenario(valid({ approval: { campaignId: 'c', profileDigest: 'short', expiresAt: '2030-01-01T00:00:00Z' } })), /sha256/);
  assert.throws(() => validateL3Scenario(valid({ approval: { campaignId: 'c', profileDigest: DIGEST, expiresAt: 'not-a-date' } })), /ISO-8601/);
});
