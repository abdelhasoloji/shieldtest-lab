import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILES,
  PROFILE_NAMES,
  isKnownProfile,
  resolveProfile,
  sanitizeProfileLabel,
} from '../profiles.mjs';

// The reflected-UDP shapes added for broader coverage (CLDAP, chargen, …).
const ADDED = ['cldap', 'chargen', 'ripv1', 'arms', 'wsd', 'tftp', 'qotd'];

test('new amplification profiles are registered and well-formed', () => {
  for (const name of ADDED) {
    assert.ok(isKnownProfile(name), `${name} should be a known profile`);
    const p = PROFILES[name];
    assert.ok(Number.isFinite(p.factor) && p.factor >= 1, `${name}.factor`);
    assert.ok(Number.isFinite(p.packetFactor) && p.packetFactor >= 1, `${name}.packetFactor`);
    assert.ok(Number.isFinite(p.referenceBap) && p.referenceBap >= 1, `${name}.referenceBap`);
    assert.equal(typeof p.note, 'string');
    // PROFILE_NAMES is derived from the map, so a new profile joins it.
    assert.ok(PROFILE_NAMES.includes(name));
    // resolveProfile returns the profile itself, not the default fallback.
    assert.equal(resolveProfile(name), p);
  }
});

test('unknown profile names still collapse to "other" (cardinality bound)', () => {
  assert.equal(sanitizeProfileLabel('cldap'), 'cldap');
  assert.equal(sanitizeProfileLabel('not-a-real-vector'), 'other');
  assert.equal(sanitizeProfileLabel(undefined), 'other');
});
