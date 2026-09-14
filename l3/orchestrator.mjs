import { evaluateConfigLock } from './config-lock.mjs';
import { verifyCampaignToken } from './campaign-token.mjs';
import { runConfinementPreflight } from './confinement.mjs';
import { createBackend } from './backends/index.mjs';
import { createKillSwitch } from './kill-switch.mjs';
import { toL3SpoofVerdict } from './verdict.mjs';

// The guarded run: it wires every safety layer in order and is fail-closed at
// each gate, so nothing runs unless ALL of them pass. In V1 the only "run" is a
// dry-run or namespace-sim (no real emission). Pure and injectable — probes,
// nonces, the run registry and the clock are all passed in, so it runs under
// `node --test` with no root, no capability, no real packet.
//
// Order: Lock 1 (config) → local token (signature/expiry/params/nonce) → single-
// campaign claim → Lock 2 (confinement preflight) → kill-switch-supervised
// backend run → verdict. The single-campaign slot is always released.

export async function runSpoofCampaign(input = {}) {
  const {
    scenario,
    token,
    secret,
    env = {},
    backend: backendId,
    interfaceAllowlist = [],
    probes,
    nonces,
    runRegistry,
    now = Date.now(),
    seed = 1,
    dockerNet,
    labTarget,
    runner,
  } = input;

  const startedAt = new Date(now).toISOString();
  const opts = { labTarget, runner };
  const verdict = (outcome, evidence) =>
    toL3SpoofVerdict({ scenario, startedAt, outcome, ...evidence }, opts);

  if (!scenario || typeof scenario !== 'object') {
    throw new Error('runSpoofCampaign requires a validated scenario');
  }

  // Lock 1 — configuration.
  const cfg = evaluateConfigLock(scenario, { env, backend: backendId, interfaceAllowlist, now });
  if (!cfg.allowed) {
    return verdict('BLOCKED_BY_CONFIG', { stopReason: 'config-lock', configLocks: cfg.locks });
  }

  // Local signed authorization (signature → expiry → exact params → nonce).
  const tok = verifyCampaignToken(token, secret, { scenario, now, nonces });
  if (!tok.ok) {
    return verdict('BLOCKED_BY_TOKEN', { stopReason: `token:${tok.reason}` });
  }

  // Single spoofed campaign at a time.
  const claim = runRegistry ? runRegistry.claim(scenario.approval.campaignId) : { ok: true };
  if (!claim.ok) {
    return verdict('BLOCKED_BY_CONCURRENCY', { stopReason: claim.reason });
  }

  try {
    // Lock 2 — confinement preflight (fail-closed; a throwing probe → NO_GO).
    const cert = await runConfinementPreflight(scenario, probes, dockerNet ? { dockerNet } : {});
    if (cert.decision !== 'GO') {
      return verdict('BLOCKED_BY_PREFLIGHT', {
        confinementCertificate: cert,
        stopReason: 'confinement-no-go',
      });
    }

    // Kill switch: absolute timeout = the scenario duration + a small margin,
    // independent of the backend's own loop; a trip stops the backend.
    const backend = createBackend(backendId);
    const ks = createKillSwitch({
      absoluteTimeoutMs: (scenario.durationSec + 5) * 1000,
      rateCapPps: scenario.pps,
      expectedDestIp: scenario.resolved.targetIp,
      useRealTimer: false,
      onTrip: () => backend.stop(),
    });

    const result = await backend.run(scenario, { seed, shouldStop: () => ks.tripped });
    const finishedAt = new Date().toISOString();

    const outcome =
      backendId === 'dry-run'
        ? 'DRY_RUN'
        : ks.tripped
          ? 'ABORTED_BY_KILL_SWITCH'
          : 'COMPLETED';

    return verdict(outcome, {
      confinementCertificate: cert,
      finishedAt,
      result,
      capture: result,
      killSwitch: { tripped: ks.tripped, reason: ks.reason },
    });
  } finally {
    if (runRegistry) runRegistry.release(scenario.approval.campaignId);
  }
}
