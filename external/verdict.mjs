// Read-only verdict artifact for an EXTERNAL, authorized resilience test.
//
// Kept separate from the synthetic lab verdict (../verdict.mjs) so the lab's
// class-C measurement stays pure. This one describes an over-the-wire test
// against a proven-authorized target and its resilience signal. It does NOT
// assert a DRS letter class — the control plane maps that per policy.

export const EXTERNAL_VERDICT_SCHEMA = 'shieldtest.external.verdict/v1';

export const EXTERNAL_OUTCOMES = Object.freeze([
  'ABSORBED', // origin handled the stream churn (responses seen, low error rate)
  'MITIGATED_GOAWAY', // origin/proxy pushed back with GOAWAY (protection engaged)
  'DEGRADED', // high error rate / connection collapse under pressure
  'INCONCLUSIVE',
]);

const ERROR_RATE_DEGRADED = 0.5;

export function classifyExternal(summary) {
  if (summary.goaway) return 'MITIGATED_GOAWAY';
  const opened = summary.opened || 0;
  if (opened === 0) return 'INCONCLUSIVE';
  const errorRate = (summary.errors || 0) / opened;
  return errorRate >= ERROR_RATE_DEGRADED ? 'DEGRADED' : 'ABSORBED';
}

export function toExternalVerdict(summary, opts = {}) {
  return {
    schema: EXTERNAL_VERDICT_SCHEMA,
    layer: 'L7',
    vector: summary.kind || 'http2-rapid-reset',
    target: summary.target ?? null,
    authorizationRef: opts.authorizationRef ?? null,
    effective: summary.effective ?? null,
    measurement: {
      streamsOpened: summary.opened ?? 0,
      resetsSent: summary.resetsSent ?? 0,
      responses: summary.responses ?? 0,
      errors: summary.errors ?? 0,
      goaway: !!summary.goaway,
      effectiveRps: summary.effectiveRps ?? 0,
      durationMs: summary.durationMs ?? 0,
    },
    outcome: classifyExternal(summary),
    drsClass: null, // assigned by the control plane per drs-validation-policy
    runner: opts.runner ?? 'shieldtest-external',
    source: 'shieldtest-external',
    generatedAt: new Date().toISOString(),
  };
}
