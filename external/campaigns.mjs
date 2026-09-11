// Named, allowlisted campaign templates for external authorized resilience tests.
//
// Same golden rule as the synthetic lab's scenarios: the control panel can only
// launch a campaign BY NAME from this catalogue — never an arbitrary list of
// steps off the wire. A campaign is a bounded sequence of governed steps against
// ONE authorized target; every step is an already-governed vector at a bounded
// intensity. The per-target caps and the vector HARD ceilings still clamp each
// step at run time.

export const CAMPAIGNS = {
  'h2-smoke': {
    summary: 'HTTP/2 rapid-reset — single low-intensity smoke step.',
    steps: [{ vector: 'http2-rapid-reset', rps: 20, streams: 200, durationSec: 10, concurrency: 16 }],
    cooldownSec: 5,
  },
  'h2-ramp': {
    summary: 'HTTP/2 rapid-reset in stages: warm-up -> nominal -> stress.',
    steps: [
      { vector: 'http2-rapid-reset', rps: 20, streams: 200, durationSec: 20, concurrency: 16 },
      { vector: 'http2-rapid-reset', rps: 60, streams: 800, durationSec: 30, concurrency: 32 },
      { vector: 'http2-rapid-reset', rps: 150, streams: 2000, durationSec: 30, concurrency: 64 },
    ],
    cooldownSec: 15,
  },
};

export function campaignNames() {
  return Object.keys(CAMPAIGNS);
}

export function isKnownCampaign(name) {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(CAMPAIGNS, name);
}

/** Resolve a campaign by name; throws on anything not in the allowlist. */
export function resolveCampaign(name) {
  if (!isKnownCampaign(name)) {
    throw new Error(`campaign must be one of the named campaigns: ${campaignNames().join(', ')}`);
  }
  return CAMPAIGNS[name];
}

/** Non-secret description for the control panel. */
export function describeCampaign(name) {
  const c = resolveCampaign(name);
  return {
    name,
    summary: c.summary,
    steps: c.steps.map((s) => ({ vector: s.vector, rps: s.rps, streams: s.streams, durationSec: s.durationSec })),
    cooldownSec: c.cooldownSec ?? 0,
  };
}
