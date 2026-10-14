import dns from 'node:dns/promises';

// Hard, fail-closed authorization gate for EXTERNAL resilience tests.
//
// The synthetic lab (lib/net-guard.mjs) forbids ever leaving RFC1918/loopback.
// This gate governs the OPPOSITE path: it lets an authorized resilience test
// reach a REAL target — but ONLY a target that is explicitly registered AND
// proven-authorized. There is no "allow all", no env var that widens it, and an
// empty registry authorizes nothing. This is what makes "only bank.cz is
// accepted" a property of the system, not a string in a config.
//
// Two checks, by design:
//   1. assertAuthorizedTarget() — synchronous, against the static registry:
//      the host is registered, not expired, and inside its authorized window.
//   2. verifyControl() — async, at dispatch time: the target still publishes the
//      domain-control token (a DNS TXT record). Remove the token to revoke
//      instantly, without touching this code.

export function normalizeHost(h) {
  return String(h || '').trim().toLowerCase().replace(/\.$/, '');
}

/** Build a host->entry Map from a registry object ({targets:[...]}) or array. */
export function loadRegistry(source) {
  const list = Array.isArray(source) ? source : (source && source.targets) || [];
  const m = new Map();
  for (const e of list) {
    if (!e || !e.host) continue;
    m.set(normalizeHost(e.host), e);
  }
  return m;
}

export function isWithinWindow(entry, now) {
  const w = entry.window;
  if (!w || w === 'always') return true;
  const from = w.from ? Date.parse(w.from) : -Infinity;
  const to = w.to ? Date.parse(w.to) : Infinity;
  return now >= from && now <= to;
}

/**
 * Throws unless `host` is an authorized target: present in the registry, not
 * expired, and within its window. Returns the entry (carrying caps) so the
 * caller can clamp the requested test intensity. Fail-closed: an empty/missing
 * registry refuses everything.
 */
export function assertAuthorizedTarget(host, { registry, now = Date.now() } = {}) {
  if (!(registry instanceof Map) || registry.size === 0) {
    throw new Error('no authorized targets registered (fail-closed): refusing to run any external test');
  }
  const h = normalizeHost(host);
  const entry = registry.get(h);
  if (!entry) {
    throw new Error(`target ${JSON.stringify(host)} is not on the authorized allowlist; refusing`);
  }
  if (entry.expiresAt && now > Date.parse(entry.expiresAt)) {
    throw new Error(`authorization for ${h} expired at ${entry.expiresAt}`);
  }
  if (!isWithinWindow(entry, now)) {
    throw new Error(`current time is outside the authorized maintenance window for ${h}`);
  }
  return entry;
}

/**
 * Dispatch-time re-verification of domain control. The target owner keeps a TXT
 * token live at `_shieldtest.<host>` (or entry.verification.name); removing it
 * revokes authorization immediately. `resolver` is injectable for tests.
 */
export async function verifyControl(entry, { resolver = dns } = {}) {
  const v = entry && entry.verification;
  if (!v || v.method !== 'dns-txt' || !v.token) {
    throw new Error('entry has no usable dns-txt domain-control verification');
  }
  const name = v.name || `_shieldtest.${normalizeHost(entry.host)}`;
  let records = [];
  try {
    records = (await resolver.resolveTxt(name)).flat();
  } catch {
    records = [];
  }
  if (!records.includes(v.token)) {
    throw new Error(`domain-control token not found at TXT ${name} — authorization not proven`);
  }
  return true;
}

/** Clamp requested test parameters to the target's caps. Never exceeds a cap. */
export function clampToCaps(requested = {}, caps = {}) {
  const clampOne = (val, max, dflt) => {
    const v = Number.isFinite(val) && val > 0 ? val : dflt;
    return max != null ? Math.min(v, max) : v;
  };
  return {
    rps: clampOne(requested.rps, caps.maxRps, caps.maxRps ?? 0),
    streams: clampOne(requested.streams, caps.maxStreams, caps.maxStreams ?? 0),
    durationSec: clampOne(requested.durationSec, caps.maxDurationSec, caps.maxDurationSec ?? 0),
    concurrency: clampOne(requested.concurrency, caps.maxConcurrency, caps.maxConcurrency ?? 0),
  };
}
