import { getProfile, getInterface } from './registry.mjs';
import { profileDigest } from './digest.mjs';

// Lock 1 — configuration gate. The spoofing mode stays DISABLED unless EVERY
// condition below holds. A single env var is never enough. Pure and injectable:
// it evaluates a validated scenario against the env + an interface allowlist and
// returns each lock's pass/fail, plus an overall `allowed`. Fail-closed.

// V1 backends that may actually run. `trex` is a known id but is DISABLED and can
// never be selected for a run (it needs a dedicated hardened container + real
// containment proof + WEDOS authorization — never enabled here).
export const RUNNABLE_BACKENDS = Object.freeze(new Set(['dry-run', 'namespace-sim']));
export const KNOWN_BACKENDS = Object.freeze(new Set(['dry-run', 'namespace-sim', 'trex']));

/**
 * @param {object} scenario   a validated L3 scenario (from validateL3Scenario)
 * @param {object} opts
 * @param {Record<string,string|undefined>} opts.env
 * @param {string} opts.backend            explicitly selected backend id
 * @param {Set<string>|string[]} opts.interfaceAllowlist  allowed interface IDs (local operator config)
 * @param {number} [opts.now]              epoch ms (for expiry), default Date.now()
 */
export function evaluateConfigLock(scenario, opts = {}) {
  const env = opts.env ?? {};
  const now = opts.now ?? Date.now();
  const allowlist = new Set(opts.interfaceAllowlist ?? []);
  const locks = [];
  const add = (id, ok, detail) => locks.push({ id, ok: ok === true, detail });

  // Guard: a valid scenario is required (fail-closed).
  const s = scenario && typeof scenario === 'object' ? scenario : null;
  if (!s) {
    return { allowed: false, locks: [{ id: 'scenario', ok: false, detail: 'no validated scenario' }] };
  }

  add('spoofing-enabled', env.LAB_SPOOFING_ENABLED === '1', 'LAB_SPOOFING_ENABLED must equal "1"');

  add('backend-selected-and-runnable', RUNNABLE_BACKENDS.has(opts.backend),
    KNOWN_BACKENDS.has(opts.backend)
      ? `backend "${opts.backend}" is not runnable in V1 (disabled)`
      : `backend "${opts.backend}" is not a known backend`);

  add('target-registered', typeof s.targetId === 'string' && !!s.resolved?.targetIp, 'target must be registered');
  add('source-pool-registered', typeof s.sourcePoolId === 'string' && !!s.resolved?.sourcePoolCidr, 'source pool must be registered');

  // Profile approved + not expired.
  const expires = Date.parse(s.approval?.expiresAt);
  add('approval-present-and-unexpired', Number.isFinite(expires) && expires > now,
    Number.isFinite(expires) ? 'approval has expired' : 'approval expiry missing');

  // Digest of the approved profile must match the registered profile's digest.
  let digestOk = false;
  let digestDetail = '';
  try {
    digestOk = s.approval?.profileDigest === profileDigest(s.profileId);
    digestDetail = digestOk ? 'ok' : 'approval digest does not match the registered profile';
  } catch (err) {
    digestDetail = `digest error: ${err instanceof Error ? err.message : String(err)}`;
  }
  add('profile-digest-matches', digestOk, digestDetail);

  // Requested limits strictly within the profile's absolute caps (re-affirmed).
  try {
    const p = getProfile(s.profileId);
    const within = s.pps <= p.absMaxPps && s.durationSec <= p.absMaxDurationSec && s.packetSize <= p.absMaxPacketSize;
    add('limits-within-absolute', within, 'requested limits must be ≤ the profile absolute caps');
  } catch (err) {
    add('limits-within-absolute', false, `profile error: ${err instanceof Error ? err.message : String(err)}`);
  }

  add('interface-allowlisted', allowlist.has(s.interfaceId), `interface ${s.interfaceId} must be on the local allowlist`);

  // Proof the test interface is NOT the management interface.
  let notMgmt = false;
  try {
    notMgmt = getInterface(s.interfaceId).isManagement === false;
  } catch {
    notMgmt = false;
  }
  add('test-interface-not-management', notMgmt, 'test interface must not be the management interface');

  return { allowed: locks.every((l) => l.ok), locks };
}
