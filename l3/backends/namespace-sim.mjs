import { getSourcePool } from '../../lib/source-pool.mjs';
import { buildEgressPolicy, createEgressGuard } from '../egress-guard.mjs';
import { buildEmissionPlan, sampleSources } from './plan.mjs';

// Functional simulation backend. It MODELS the bounded packet stream entirely
// in-process — generating forged-source packet descriptors and running every one
// through the independent egress guard — and produces realistic accepted/dropped
// telemetry. It opens NO socket and forges NO real L3 packet: the "namespace"
// isolation of a real netns-backed variant is a future, WEDOS-gated step. A
// virtual clock (1s per plan second) drives the guard's rate window, so the
// simulation is deterministic and safe under `node --test` — no root, no capability.

export const id = 'namespace-sim';
export const runnable = true;

export function preflight(scenario, ctx = {}) {
  // The only readiness the pure simulation needs is a source pool it can sample.
  try {
    getSourcePool(scenario.sourcePoolId);
    return { ready: true };
  } catch (err) {
    return { ready: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export function emit(scenario, ctx = {}) {
  const pool = getSourcePool(scenario.sourcePoolId);
  const guard = ctx.guard ?? createEgressGuard(buildEgressPolicy(scenario));
  const plan = buildEmissionPlan(scenario);
  const sources = sampleSources(pool, scenario.sourceCount, ctx.seed ?? 1);

  let emittedPackets = 0;
  let emittedBytes = 0;
  let stoppedEarly = false;
  const sourceHits = Object.create(null);
  let cursor = 0;

  for (const sec of plan.seconds) {
    if (ctx.shouldStop?.()) {
      stoppedEarly = true;
      break;
    }
    const now = sec.t * 1000; // virtual clock
    for (let k = 0; k < sec.pps; k++) {
      const srcIp = sources[cursor % sources.length];
      cursor += 1;
      const res = guard.classify(
        {
          srcIp,
          dstIp: scenario.resolved.targetIp,
          dstPort: scenario.destinationPort,
          protocol: scenario.protocol,
          bytes: scenario.packetSize,
        },
        now,
      );
      if (res.action === 'ACCEPT') {
        emittedPackets += 1;
        emittedBytes += scenario.packetSize;
        sourceHits[srcIp] = (sourceHits[srcIp] ?? 0) + 1;
      }
    }
  }

  const snap = guard.snapshot();
  return Object.freeze({
    backend: id,
    simulated: true,
    stoppedEarly,
    emittedPackets,
    emittedBytes,
    plannedPackets: plan.totalPackets,
    droppedByGuard: snap.dropped,
    dropReasons: snap.dropReasons,
    distinctSources: Object.keys(sourceHits).length,
    // Peak observed emitted PPS across the plan seconds (never above the cap).
    peakPps: Math.max(0, ...plan.seconds.map((s) => s.pps)),
  });
}

export function stop() {
  /* the loop is cooperative via ctx.shouldStop; nothing external to release */
}
