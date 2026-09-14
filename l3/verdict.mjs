import { sha256Hex } from './digest.mjs';

// Read-only, class-C verdict for a spoofed L3 run. Same boundary as the UDP
// amplification verdict: this is class C ("network bench") — the control plane
// records class A/B only and REJECTS class C, so this artifact is standalone,
// read-only evidence and the control plane never opens a raw/spoofing socket. In
// V1 no real packet is ever emitted (dry-run / namespace-sim), which the verdict
// records via `simulated` and the `outcome`.

export const L3_VERDICT_SCHEMA = 'shieldtest.lab.verdict/v1';
export const L3_VERDICT_KIND = 'l3-spoof';

export const L3_OUTCOMES = Object.freeze([
  'BLOCKED_BY_CONFIG', //       Lock 1 (config) refused the run
  'BLOCKED_BY_TOKEN', //        local signed authorization failed
  'BLOCKED_BY_CONCURRENCY', //  another spoofed campaign was already active
  'BLOCKED_BY_PREFLIGHT', //    Lock 2 (confinement) returned NO_GO
  'DRY_RUN', //                 dry-run backend: nothing emitted
  'COMPLETED', //               simulation completed within bounds
  'ABORTED_BY_KILL_SWITCH', //  the kill switch tripped mid-run
]);

/** SHA-256 hex of a capture object (bounded evidence). Pure. */
export function captureHash(capture) {
  return sha256Hex(capture ?? {});
}

/**
 * Build the l3-spoof verdict from a run's evidence. Pure; every field is derived
 * from the evidence the orchestrator collected. `opts.labTarget` / `opts.runner`
 * are free-form labels.
 */
export function toL3SpoofVerdict(evidence, opts = {}) {
  const e = evidence ?? {};
  const s = e.scenario ?? {};
  const result = e.result ?? null;
  const cert = e.confinementCertificate ?? null;
  const capture = e.capture ?? result ?? {};

  return {
    schema: L3_VERDICT_SCHEMA,
    class: 'C', // network bench — never a class-A/B verdict
    kind: L3_VERDICT_KIND,
    simulated: e.outcome === 'COMPLETED' || e.outcome === 'ABORTED_BY_KILL_SWITCH' ? true : e.outcome === 'DRY_RUN' ? false : null,
    scenario: {
      campaignId: s.approval?.campaignId ?? null,
      profileId: s.profileId ?? null,
      targetId: s.targetId ?? null,
      sourcePoolId: s.sourcePoolId ?? null,
    },
    labTarget: (opts.labTarget ?? s.resolved?.targetIp ?? 'lab-target.internal'),
    profile: {
      requested: e.requestedProfile ?? s.profileId ?? null,
      applied: e.appliedProfile ?? s.profileId ?? null,
      digest: s.approval?.profileDigest ?? null,
    },
    // The GO/NO_GO confinement certificate travels WITH the verdict.
    confinement: cert,
    window: {
      startedAt: e.startedAt ?? null,
      finishedAt: e.finishedAt ?? null,
      stopReason: e.killSwitch?.reason ?? e.stopReason ?? null,
    },
    packets: {
      requested: result?.plannedPackets ?? 0,
      emitted: result?.emittedPackets ?? 0,
      emittedBytes: result?.emittedBytes ?? 0,
      peakPps: result?.peakPps ?? 0,
    },
    sources: {
      pool: s.sourcePoolId ?? null,
      distinct: result?.distinctSources ?? 0,
    },
    destination: {
      targetId: s.targetId ?? null,
      observed: s.resolved?.targetIp ?? null,
    },
    egressGuard: {
      dropped: result?.droppedByGuard ?? 0,
      dropReasons: result?.dropReasons ?? {},
    },
    killSwitch: {
      tripped: e.killSwitch?.tripped ?? false,
      reason: e.killSwitch?.reason ?? null,
    },
    captureSha256: captureHash(capture),
    outcome: e.outcome ?? null,
    runner: opts.runner ?? 'shieldtest-lab',
    source: 'shieldtest-lab',
    generatedAt: new Date().toISOString(),
  };
}
