import { createHash } from 'node:crypto';
import { getProfile } from './registry.mjs';

// Deterministic SHA-256 of a profile, so an approval can bind to an EXACT profile
// version. The control plane approves `profileId` + `profileDigest`; if the
// registered profile's content ever changes, its digest changes and a stale
// approval no longer matches (verified by the config-lock and, later, the token).

/** Canonical JSON with object keys sorted recursively (stable across key order). */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 hex of any JSON-serializable value, over its canonical form. */
export function sha256Hex(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

/** Digest of the registered profile with the given id (throws if unknown). The
 *  digest covers the fields that define the profile's behaviour and caps. */
export function profileDigest(profileId) {
  const p = getProfile(profileId);
  return sha256Hex({
    id: p.id,
    protocol: p.protocol,
    ports: [...p.ports],
    rampStrategy: p.rampStrategy,
    absMaxPps: p.absMaxPps,
    absMaxDurationSec: p.absMaxDurationSec,
    absMaxPacketSize: p.absMaxPacketSize,
    absMaxSources: p.absMaxSources,
  });
}
