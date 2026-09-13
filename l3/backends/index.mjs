import * as dryRun from './dry-run.mjs';
import * as namespaceSim from './namespace-sim.mjs';
import * as trex from './trex.mjs';

// Backend registry + the { preflight, emit, stop } abstraction. No backend ever
// accepts a user-supplied shell command; each is a pure module keyed by id. Only
// `dry-run` and `namespace-sim` are runnable in V1 — `trex` is registered but
// disabled and refuses to run.

const BACKENDS = Object.freeze({
  'dry-run': dryRun,
  'namespace-sim': namespaceSim,
  trex,
});

/** The raw backend module for an id (fail-closed on unknown). */
export function selectBackend(backendId) {
  const b = BACKENDS[backendId];
  if (!b) throw new Error(`unknown backend: ${JSON.stringify(backendId)}`);
  return b;
}

export function listBackends() {
  return Object.values(BACKENDS).map((b) => ({ id: b.id, runnable: b.runnable }));
}

/**
 * Instantiate a stoppable backend runner around the selected module.
 * `run(scenario, ctx)` runs the backend's own preflight then its emit; `stop()`
 * cooperatively halts emit between plan seconds (wired to the kill switch in a
 * later phase). A disabled backend refuses to run.
 */
export function createBackend(backendId) {
  const impl = selectBackend(backendId);
  let stopped = false;

  return {
    id: impl.id,
    runnable: impl.runnable,
    async run(scenario, ctx = {}) {
      if (!impl.runnable) {
        const reason = impl.preflight ? impl.preflight(scenario, ctx).reason : 'disabled';
        throw new Error(`backend ${impl.id} is disabled: ${reason ?? 'not runnable'}`);
      }
      const pre = await impl.preflight(scenario, ctx);
      if (!pre.ready) {
        throw new Error(`backend ${impl.id} preflight not ready: ${pre.reason ?? ''}`);
      }
      const shouldStop = () => stopped || (ctx.shouldStop?.() ?? false);
      return impl.emit(scenario, { ...ctx, shouldStop });
    },
    stop() {
      stopped = true;
      impl.stop?.();
    },
    get stopped() {
      return stopped;
    },
  };
}
