// Lab verdict artifact — the read-only, class-C measurement the closed lab hands
// back for a resilience assessment.
//
// IMPORTANT boundary note. UDP amplification is **class C** ("network bench") in
// ShieldTest's drs-validation-policy. The control plane's POST /api/drs-validations
// endpoint records **class A/B only** and deliberately REJECTS class C, so this
// verdict is NEVER posted there. It is standalone, read-only evidence — attach it
// to a report, diff two runs, or scrape the same numbers from Prometheus. The
// control plane measures the lab; it never runs it and never opens an
// amplification socket. This artifact keeps that separation explicit.

export const VERDICT_SCHEMA = 'shieldtest.lab.verdict/v1';
export const DEFAULT_LAB_TARGET = 'lab-target.internal';

export const OUTCOMES = Object.freeze([
  'UNMITIGATED_BASELINE', // no scrubber in path: a pure amplification measurement
  'NOT_MITIGATED', // scrubber present but never engaged
  'MITIGATED', // scrubber engaged and dropped excess with negligible collateral
  'MITIGATED_WITH_COLLATERAL', // scrubber engaged but harmed legitimate traffic
  'STATE_TABLE_SATURATED', // TCP: the target shed connections (state table full)
  'ABSORBED', // TCP: all offered connections were accepted (no saturation)
]);

// Collateral (share of dropped packets that were legitimate) above this counts as
// a mitigation that harmed good traffic.
const COLLATERAL_THRESHOLD_PCT = 5;

/** Derives a class-C outcome from the run's mitigation behaviour. Pure. */
export function classifyOutcome(summary) {
  const s = summary.scrubber;
  if (!s) return 'UNMITIGATED_BASELINE';
  if (!s.mitigating) return 'NOT_MITIGATED';
  return (s.collateralPct ?? 0) > COLLATERAL_THRESHOLD_PCT
    ? 'MITIGATED_WITH_COLLATERAL'
    : 'MITIGATED';
}

/**
 * Maps a run summary to the lab verdict artifact. `opts.labTarget` names the
 * isolated lab host the measurement pertains to (default `lab-target.internal`);
 * `opts.runner` is a free-form label for who/what produced it.
 */
export function toVerdict(summary, opts = {}) {
  const labTarget = (opts.labTarget ?? DEFAULT_LAB_TARGET).trim() || DEFAULT_LAB_TARGET;
  // TCP connection-pressure runs carry a different measurement shape.
  if (summary.kind === 'tcp') {
    const t = summary.target ?? {};
    return {
      schema: VERDICT_SCHEMA,
      class: 'C', // network bench — never a class-A/B verdict
      kind: 'tcp-connection-pressure',
      scenario: summary.scenario ?? null,
      labTarget,
      connections: {
        opened: summary.generator?.opened ?? 0,
        accepted: t.accepted ?? 0,
        refused: t.refused ?? 0,
        concurrentPeak: t.concurrentPeak ?? 0,
        capacity: t.capacity ?? 0,
        saturationPct: t.saturationPct ?? 0,
      },
      outcome: (t.saturationPct ?? 0) > 0 ? 'STATE_TABLE_SATURATED' : 'ABSORBED',
      runner: opts.runner ?? 'shieldtest-lab',
      source: 'shieldtest-lab',
      generatedAt: new Date().toISOString(),
    };
  }
  const r = summary.reflector ?? {};
  const t = summary.target ?? {};
  const s = summary.scrubber ?? null;
  return {
    schema: VERDICT_SCHEMA,
    class: 'C', // network bench — see drs-validation-policy.md (NOT a class-A/B verdict)
    kind: 'udp-amplification',
    scenario: summary.scenario ?? null,
    labTarget,
    profiles: Object.keys(summary.perProfile ?? {}),
    amplificationFactor: r.bap ?? 0,
    packetAmplification: r.packetAmplification ?? 0,
    requests: r.requests ?? 0,
    target: {
      packets: t.packets ?? 0,
      avgPps: t.avgPps ?? 0,
      avgBps: t.avgBps ?? 0,
    },
    mitigation: s
      ? {
          strategy: s.strategy ?? null,
          engaged: !!s.mitigating,
          detectionSec: s.detectionDelaySec ?? null,
          dropped: s.dropped ?? 0,
          collateralPct: s.collateralPct ?? 0,
        }
      : null,
    outcome: classifyOutcome(summary),
    runner: opts.runner ?? 'shieldtest-lab',
    source: 'shieldtest-lab',
    generatedAt: new Date().toISOString(),
  };
}
