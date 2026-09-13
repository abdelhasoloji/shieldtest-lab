import { buildEmissionPlan } from './plan.mjs';

// Default backend. Emits NOTHING — it only reports what a run WOULD send, so an
// operator can review a spoofed scenario end-to-end (config lock, preflight,
// egress policy, plan) with zero packets and zero capability.

export const id = 'dry-run';
export const runnable = true;

export function preflight() {
  // Dry-run needs no system readiness (it never touches the network).
  return { ready: true };
}

export function emit(scenario) {
  const plan = buildEmissionPlan(scenario);
  return Object.freeze({
    backend: id,
    simulated: false,
    emittedPackets: 0,
    emittedBytes: 0,
    plannedPackets: plan.totalPackets,
    plannedBytes: plan.totalBytes,
    seconds: plan.seconds.length,
  });
}

export function stop() {
  /* nothing to stop */
}
