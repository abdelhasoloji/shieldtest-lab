// V1 spoofed profiles — the authoritative definitions.
//
// Absolute caps are hard-coded and can NEVER be raised by an environment variable,
// and each stays within a single global ceiling. The per-profile default is
// deliberately very low. Every profile is bounded and FINITE: a mandatory,
// capped duration (no infinite runs) and mandatory auto-stop are structural — the
// scenario model requires a positive `durationSec ≤ absMaxDurationSec`, and the
// kill switch always arms an absolute timeout. The TCP profile is a state-table
// saturation MODEL only: no evasion, no scanning, no dynamic target selection.

/** One global ceiling no profile may exceed (a reasonable bound for a VM sim). */
export const L3_ABSOLUTE_CEILING = Object.freeze({
  maxPps: 200,
  maxDurationSec: 30,
  maxPacketSize: 512,
  maxSources: 256,
});

// Deliberately tiny default offered rate for any profile.
const DEFAULT_PPS = 20;

const PROFILE_DEFS = [
  {
    id: 'udp-spoofed-constant',
    protocol: 'udp',
    ports: [9002],
    rampStrategy: 'constant',
    riskLevel: 'medium',
    reason:
      'Steady spoofed UDP toward the synthetic target — the baseline shape that shows a ' +
      'source-blocklist defense being defeated while a rate/behaviour defense holds.',
    defaultPps: DEFAULT_PPS,
    absMaxPps: 200,
    absMaxDurationSec: 30,
    absMaxPacketSize: 512,
    absMaxSources: 256,
    expectedMetrics: [
      'emittedPps',
      'droppedByGuardPct',
      'distinctSources',
      'targetAvailabilityPct',
      'scrubberDetectionSec',
      'scrubberMitigationSec',
    ],
  },
  {
    id: 'udp-spoofed-ramp',
    protocol: 'udp',
    ports: [9002],
    rampStrategy: 'ramp',
    riskLevel: 'medium',
    reason:
      'Ramping spoofed UDP — measures how quickly an adaptive / rate-based defense reacts ' +
      'as the offered spoofed load climbs.',
    defaultPps: DEFAULT_PPS,
    absMaxPps: 200,
    absMaxDurationSec: 30,
    absMaxPacketSize: 512,
    absMaxSources: 256,
    expectedMetrics: [
      'emittedPps',
      'rampToPps',
      'droppedByGuardPct',
      'targetAvailabilityPct',
      'scrubberDetectionSec',
    ],
  },
  {
    id: 'udp-spoofed-burst',
    protocol: 'udp',
    ports: [9002],
    rampStrategy: 'burst',
    riskLevel: 'high',
    reason:
      'Pulsed spoofed UDP — synchronized bursts that beat a fixed-window rate limiter and ' +
      'test burst absorption.',
    defaultPps: DEFAULT_PPS,
    absMaxPps: 200,
    absMaxDurationSec: 20,
    absMaxPacketSize: 512,
    absMaxSources: 256,
    expectedMetrics: ['emittedPps', 'peakPps', 'droppedByGuardPct', 'targetAvailabilityPct'],
  },
  {
    id: 'tcp-syn-spoofed-model',
    protocol: 'tcp',
    ports: [9002],
    rampStrategy: 'constant',
    riskLevel: 'high',
    reason:
      'State-table saturation MODEL (spoofed-SYN shape) — measures connection-table pressure ' +
      'in the closed lab. Not an attack tool: no evasion, no scan, no dynamic target selection.',
    defaultPps: DEFAULT_PPS,
    absMaxPps: 200,
    absMaxDurationSec: 20,
    absMaxPacketSize: 64,
    absMaxSources: 256,
    // Explicitly enumerated so a test can assert these are NEVER implemented.
    notModeled: ['evasion', 'scan', 'dynamic-target-selection'],
    expectedMetrics: ['emittedPps', 'stateTableSaturationPct', 'targetAvailabilityPct'],
  },
];

/** Frozen registry, validated at load: every cap is finite, positive, and within
 *  the global ceiling; the default never exceeds the profile's own cap. */
export const L3_PROFILES = Object.freeze(
  Object.fromEntries(
    PROFILE_DEFS.map((p) => {
      const c = L3_ABSOLUTE_CEILING;
      const ok =
        p.absMaxPps > 0 && p.absMaxPps <= c.maxPps &&
        p.absMaxDurationSec > 0 && p.absMaxDurationSec <= c.maxDurationSec &&
        p.absMaxPacketSize > 0 && p.absMaxPacketSize <= c.maxPacketSize &&
        p.absMaxSources > 0 && p.absMaxSources <= c.maxSources &&
        p.defaultPps > 0 && p.defaultPps <= p.absMaxPps;
      if (!ok) throw new Error(`profile ${p.id}: caps out of the absolute ceiling`);
      return [
        p.id,
        Object.freeze({
          ...p,
          ports: Object.freeze([...p.ports]),
          expectedMetrics: Object.freeze([...p.expectedMetrics]),
          ...(p.notModeled ? { notModeled: Object.freeze([...p.notModeled]) } : {}),
        }),
      ];
    }),
  ),
);

/** Look up a profile by id (fail-closed). */
export function getProfile(id) {
  const p = L3_PROFILES[id];
  if (!p) throw new Error(`unknown profile: ${JSON.stringify(id)}`);
  return p;
}

export function listProfiles() {
  return Object.values(L3_PROFILES).map((p) => ({
    id: p.id,
    protocol: p.protocol,
    riskLevel: p.riskLevel,
  }));
}
