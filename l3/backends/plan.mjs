import { getProfile } from '../registry.mjs';
import { intToIp } from '../../lib/source-pool.mjs';

// Pure, deterministic emission planning shared by the backends. NO I/O, NO
// sockets — it only describes WHAT a run would emit (per-second rate shaped by
// the profile's ramp strategy) and samples the forged sources, so both the
// dry-run and the namespace-sim backends model the same bounded stream.

/** Deterministic PRNG (mulberry32) so a simulation is reproducible from a seed. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per-second target PPS for a ramp strategy, each bounded by `pps`. */
export function perSecondRates(rampStrategy, pps, durationSec) {
  const out = [];
  for (let i = 0; i < durationSec; i++) {
    let v;
    if (rampStrategy === 'ramp') {
      v = Math.round((pps * (i + 1)) / durationSec);
    } else if (rampStrategy === 'burst') {
      v = i % 2 === 0 ? pps : Math.round(pps * 0.2);
    } else {
      v = pps; // constant
    }
    out.push(Math.min(pps, Math.max(1, v)));
  }
  return out;
}

/** Distinct forged source IPs sampled from a pool's usable host range. Capped at
 *  `count` and at the pool size; deterministic for a given seed. */
export function sampleSources(pool, count, seed = 1) {
  const span = pool.hostMax - pool.hostMin + 1;
  const n = Math.max(1, Math.min(count, span));
  const rng = mulberry32(seed >>> 0);
  const ints = new Set();
  let guard = 0;
  while (ints.size < n && guard < n * 50) {
    ints.add(pool.hostMin + Math.floor(rng() * span));
    guard += 1;
  }
  return [...ints].map(intToIp);
}

/** Build the bounded emission plan for a validated scenario. */
export function buildEmissionPlan(scenario) {
  const profile = getProfile(scenario.profileId);
  const rates = perSecondRates(profile.rampStrategy, scenario.pps, scenario.durationSec);
  const totalPackets = rates.reduce((a, b) => a + b, 0);
  return {
    seconds: rates.map((pps, i) => ({ t: i + 1, pps })),
    totalPackets,
    totalBytes: totalPackets * scenario.packetSize,
    packetSize: scenario.packetSize,
  };
}
