import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalJson } from './digest.mjs';

// Local campaign-authorization token. Even though the control plane approves a
// run, VPS2 verifies a LOCAL signed proof before a spoofed campaign may start:
// signature (HMAC-SHA256), expiry, an anti-replay nonce, and an EXACT match of
// every parameter against the validated scenario. The secret and the full token
// are never logged by this module (and callers must not log them either).

const TOKEN_FIELDS = [
  'campaignId', 'profileId', 'profileDigest', 'targetId', 'sourcePoolId',
  'pps', 'durationSec', 'packetSize', 'approver', 'nonce', 'expiresAt',
];

function normalizeClaims(claims) {
  const o = claims && typeof claims === 'object' ? claims : {};
  const payload = {};
  for (const f of TOKEN_FIELDS) {
    if (o[f] === undefined || o[f] === null || o[f] === '') {
      throw new Error(`campaign token: missing claim "${f}"`);
    }
    payload[f] = o[f];
  }
  return payload;
}

function computeSig(payload, secret) {
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new Error('campaign token secret must be at least 16 chars');
  }
  return createHmac('sha256', secret).update(canonicalJson(payload)).digest('hex');
}

/** Sign a campaign token. Returns { payload, sig }; never logs the secret. */
export function signCampaignToken(claims, secret) {
  const payload = normalizeClaims(claims);
  return { payload, sig: computeSig(payload, secret) };
}

/** In-memory nonce registry (anti-replay). `consume` records a fresh nonce and
 *  returns true; a repeat returns false. A durable store can replace this. */
export function createNonceRegistry() {
  const used = new Set();
  return {
    has: (nonce) => used.has(nonce),
    consume: (nonce) => {
      if (used.has(nonce)) return false;
      used.add(nonce);
      return true;
    },
    size: () => used.size,
  };
}

/** Fields of the token that must match the validated scenario exactly. */
function firstMismatch(payload, scenario) {
  const expect = {
    campaignId: scenario.approval?.campaignId,
    profileId: scenario.profileId,
    profileDigest: scenario.approval?.profileDigest,
    targetId: scenario.targetId,
    sourcePoolId: scenario.sourcePoolId,
    pps: scenario.pps,
    durationSec: scenario.durationSec,
    packetSize: scenario.packetSize,
  };
  for (const [k, v] of Object.entries(expect)) {
    if (payload[k] !== v) return k;
  }
  return null;
}

/**
 * Verify a campaign token. Order (fail-closed, nonce consumed LAST so an invalid
 * token never burns a nonce): signature → expiry → exact scenario-parameter
 * match → nonce replay check + consume. Returns { ok, reason? }.
 */
export function verifyCampaignToken(token, secret, { scenario, now = Date.now(), nonces } = {}) {
  if (!token || typeof token !== 'object' || !token.payload || typeof token.sig !== 'string') {
    return { ok: false, reason: 'malformed' };
  }
  let expected;
  try {
    expected = computeSig(token.payload, secret);
  } catch {
    return { ok: false, reason: 'secret' };
  }
  const got = Buffer.from(token.sig, 'hex');
  const want = Buffer.from(expected, 'hex');
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return { ok: false, reason: 'bad-signature' };
  }
  const exp = Date.parse(token.payload.expiresAt);
  if (!Number.isFinite(exp) || exp <= now) {
    return { ok: false, reason: 'expired' };
  }
  if (scenario) {
    const mism = firstMismatch(token.payload, scenario);
    if (mism) return { ok: false, reason: `param-mismatch:${mism}` };
  }
  if (nonces) {
    if (nonces.has(token.payload.nonce)) return { ok: false, reason: 'replay' };
    nonces.consume(token.payload.nonce);
  }
  return { ok: true, payload: token.payload };
}
