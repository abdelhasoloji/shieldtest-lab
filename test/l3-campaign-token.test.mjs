import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateL3Scenario } from '../l3/scenario-model.mjs';
import { profileDigest } from '../l3/digest.mjs';
import {
  signCampaignToken,
  verifyCampaignToken,
  createNonceRegistry,
} from '../l3/campaign-token.mjs';

const SECRET = 'unit-test-secret-0123456789';

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

function claims(over = {}) {
  return {
    campaignId: 'camp-1',
    profileId: 'udp-spoofed-constant',
    profileDigest: profileDigest('udp-spoofed-constant'),
    targetId: 'synthetic-target-a',
    sourcePoolId: 'documentation-pool-a',
    pps: 100,
    durationSec: 10,
    packetSize: 128,
    approver: 'ciso@wedos',
    nonce: 'nonce-1',
    expiresAt: '2030-01-01T00:00:00Z',
    ...over,
  };
}

test('a well-formed token verifies against its scenario with a fresh nonce', () => {
  const token = signCampaignToken(claims(), SECRET);
  const nonces = createNonceRegistry();
  const r = verifyCampaignToken(token, SECRET, { scenario, now: Date.parse('2025-01-01Z'), nonces });
  assert.equal(r.ok, true, r.reason);
  assert.equal(nonces.size(), 1);
});

test('a tampered payload or wrong secret fails the signature', () => {
  const token = signCampaignToken(claims(), SECRET);
  const tampered = { payload: { ...token.payload, pps: 200 }, sig: token.sig };
  assert.equal(verifyCampaignToken(tampered, SECRET, { now: Date.parse('2025-01-01Z') }).reason, 'bad-signature');
  assert.equal(verifyCampaignToken(token, 'another-secret-0123456789', { now: Date.parse('2025-01-01Z') }).reason, 'bad-signature');
});

test('an expired token is rejected', () => {
  const token = signCampaignToken(claims({ expiresAt: '2020-01-01T00:00:00Z' }), SECRET);
  assert.equal(verifyCampaignToken(token, SECRET, { now: Date.parse('2025-01-01Z') }).reason, 'expired');
});

test('any parameter differing from the scenario is a param-mismatch', () => {
  const token = signCampaignToken(claims({ pps: 99 }), SECRET);
  const r = verifyCampaignToken(token, SECRET, { scenario, now: Date.parse('2025-01-01Z') });
  assert.equal(r.reason, 'param-mismatch:pps');
});

test('a nonce cannot be replayed, and an invalid token never burns a nonce', () => {
  const nonces = createNonceRegistry();
  const token = signCampaignToken(claims(), SECRET);
  assert.equal(verifyCampaignToken(token, SECRET, { scenario, now: Date.parse('2025-01-01Z'), nonces }).ok, true);
  assert.equal(verifyCampaignToken(token, SECRET, { scenario, now: Date.parse('2025-01-01Z'), nonces }).reason, 'replay');
  // A bad-signature token does not consume its nonce.
  const bad = { payload: { ...signCampaignToken(claims({ nonce: 'nonce-x' }), SECRET).payload }, sig: 'deadbeef' };
  verifyCampaignToken(bad, SECRET, { scenario, now: Date.parse('2025-01-01Z'), nonces });
  assert.equal(nonces.has('nonce-x'), false);
});

test('malformed tokens and short secrets fail closed', () => {
  assert.equal(verifyCampaignToken(null, SECRET).reason, 'malformed');
  assert.equal(verifyCampaignToken({ payload: {}, sig: 1 }, SECRET).reason, 'malformed');
  assert.throws(() => signCampaignToken(claims(), 'short'), /at least 16/);
  const token = signCampaignToken(claims(), SECRET);
  assert.equal(verifyCampaignToken(token, 'short', { now: Date.parse('2025-01-01Z') }).reason, 'secret');
});

test('signing requires every claim', () => {
  assert.throws(() => signCampaignToken(claims({ nonce: '' }), SECRET), /missing claim "nonce"/);
});
