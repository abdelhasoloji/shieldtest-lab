import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  L3_TARGETS,
  L3_INTERFACES,
  L3_PROFILES,
  getTarget,
  getInterface,
  getProfile,
} from '../l3/registry.mjs';

test('registries are frozen', () => {
  for (const reg of [L3_TARGETS, L3_INTERFACES, L3_PROFILES]) {
    assert.equal(Object.isFrozen(reg), true);
  }
});

test('every registered target destination passes the hard RFC1918/loopback gate', () => {
  for (const [id, t] of Object.entries(L3_TARGETS)) {
    // Module load already asserted this; re-affirm the invariant is intact.
    const o = t.ip.split('.').map(Number);
    const rfc1918 =
      o[0] === 10 ||
      (o[0] === 172 && o[1] >= 16 && o[1] <= 31) ||
      (o[0] === 192 && o[1] === 168) ||
      o[0] === 127;
    assert.equal(rfc1918, true, `${id} (${t.ip}) must be private/loopback`);
  }
});

test('a target pins its own interface (caller never picks one)', () => {
  const t = getTarget('synthetic-target-a');
  assert.equal(t.interfaceId, 'lab-test-a');
  assert.equal(getInterface(t.interfaceId).isManagement, false);
});

test('the management interface is registered and flagged', () => {
  assert.equal(getInterface('mgmt').isManagement, true);
});

test('profiles carry absolute, low caps for a VM sim', () => {
  for (const [id, p] of Object.entries(L3_PROFILES)) {
    assert.ok(p.absMaxPps > 0 && p.absMaxPps <= 200, `${id} absMaxPps bounded`);
    assert.ok(p.absMaxDurationSec > 0 && p.absMaxDurationSec <= 30, `${id} absMaxDurationSec bounded`);
    assert.ok(['udp', 'tcp'].includes(p.protocol), `${id} protocol`);
    assert.ok(p.ports.every((port) => port >= 1024), `${id} unprivileged ports`);
  }
  // The four V1 profiles exist.
  for (const id of ['udp-spoofed-constant', 'udp-spoofed-ramp', 'udp-spoofed-burst', 'tcp-syn-spoofed-model']) {
    assert.ok(L3_PROFILES[id], `${id} registered`);
  }
});

test('lookups are fail-closed on unknown ids', () => {
  assert.throws(() => getTarget('nope'), /unknown target/);
  assert.throws(() => getInterface('nope'), /unknown interface/);
  assert.throws(() => getProfile('nope'), /unknown profile/);
});
