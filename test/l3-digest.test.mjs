import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex, profileDigest } from '../l3/digest.mjs';

test('sha256Hex is a 64-hex digest, stable across key order', () => {
  const a = sha256Hex({ x: 1, y: [2, 3], z: { b: 1, a: 2 } });
  const b = sha256Hex({ z: { a: 2, b: 1 }, y: [2, 3], x: 1 });
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.equal(a, b);
  assert.notEqual(a, sha256Hex({ x: 1, y: [3, 2], z: { b: 1, a: 2 } })); // array order matters
});

test('profileDigest is deterministic and distinct per profile', () => {
  const d1 = profileDigest('udp-spoofed-constant');
  assert.equal(d1, profileDigest('udp-spoofed-constant'));
  assert.match(d1, /^[a-f0-9]{64}$/);
  assert.notEqual(d1, profileDigest('udp-spoofed-ramp'));
  assert.notEqual(d1, profileDigest('tcp-syn-spoofed-model'));
  assert.throws(() => profileDigest('nope'), /unknown profile/);
});
