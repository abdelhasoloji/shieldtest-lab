// TRex adapter — DISABLED. Placeholder for a future high-rate hardware/software
// generator. It can never emit in this codebase: a real raw-packet backend needs
// a dedicated hardened container (single CAP_NET_RAW service), a proven
// confinement certificate on real infrastructure, and explicit WEDOS
// authorization at the vSwitch/hypervisor. Selecting it for a run is refused.

export const id = 'trex';
export const runnable = false;

export function preflight() {
  return {
    ready: false,
    reason:
      'trex backend is disabled — it requires a dedicated hardened container, a real ' +
      'confinement proof, and WEDOS vSwitch/hypervisor authorization; never enabled here',
  };
}

export function emit() {
  throw new Error('trex backend is disabled and cannot emit');
}

export function stop() {
  /* never started */
}
