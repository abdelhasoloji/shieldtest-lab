// Named, bounded lab scenarios — the UDP-lab counterpart of the control plane's
// curated playbooks. Each is a plain config within the hard caps; the runner
// (run-scenario.mjs) wires target → [scrubber] → reflector → generator in-process
// over loopback and prints a summary. Nothing here can target a public host.

export const SCENARIOS = {
  'amplification-ramp': {
    summary: 'Byte+packet amplification ramping up; watch BAP and target BPS grow.',
    useScrubber: false,
    generator: { SHAPE: 'ramp', FACTOR: 20, PACKET_FACTOR: 2, PPS: 100, DURATION_SEC: 6 },
  },
  'packet-rate-stress': {
    summary: 'High packet amplification at a steady rate; stresses the PPS path.',
    useScrubber: false,
    generator: { SHAPE: 'constant', FACTOR: 1, PACKET_FACTOR: 10, PPS: 150, DURATION_SEC: 6 },
  },
  'mitigation-delay-study': {
    summary: 'Attack through the scrubber; measure detection delay and residual load.',
    useScrubber: true,
    scrubber: { THRESHOLD_PPS: 100, CEILING_PPS: 40, DETECTION_DELAY_SEC: 3 },
    generator: { SHAPE: 'constant', FACTOR: 10, PACKET_FACTOR: 2, PPS: 150, DURATION_SEC: 8 },
  },
  'collateral-study': {
    summary: 'Attack + benign traffic through the scrubber; measure collateral drops.',
    useScrubber: true,
    withLegit: true,
    scrubber: { THRESHOLD_PPS: 80, CEILING_PPS: 30, DETECTION_DELAY_SEC: 2 },
    generator: { SHAPE: 'constant', FACTOR: 5, PACKET_FACTOR: 3, PPS: 120, DURATION_SEC: 8 },
    legit: { PPS: 20, DURATION_SEC: 8 },
  },

  // --- Rate-shape detection studies -----------------------------------------
  'wave-detection': {
    summary: 'Oscillating (wave) attack rate; study how detection latches on a variable rate.',
    useScrubber: true,
    scrubber: { THRESHOLD_PPS: 90, CEILING_PPS: 40, DETECTION_DELAY_SEC: 2 },
    generator: { SHAPE: 'wave', PROFILE: 'dns', PPS: 150, DURATION_SEC: 8 },
  },
  'burst-detection': {
    summary: 'On/off burst attack; study detection against a bursty rate profile.',
    useScrubber: true,
    scrubber: { THRESHOLD_PPS: 90, CEILING_PPS: 40, DETECTION_DELAY_SEC: 2 },
    generator: { SHAPE: 'burst', PROFILE: 'ssdp', PPS: 160, DURATION_SEC: 8 },
  },
  'progressive-rampup': {
    summary: 'Slow ramp from low to full rate; find the point detection engages.',
    useScrubber: true,
    scrubber: { THRESHOLD_PPS: 80, CEILING_PPS: 35, DETECTION_DELAY_SEC: 3 },
    generator: { SHAPE: 'ramp', PROFILE: 'ntp', FACTOR: 60, PACKET_FACTOR: 4, PPS: 180, DURATION_SEC: 10 },
  },

  // --- Multi-vector combos (concurrent generators, distinct profiles) --------
  'multi-profile-mix': {
    summary: 'Three synthetic profiles fired together; per-profile amplification breakdown.',
    useScrubber: false,
    generators: [
      { PROFILE: 'dns', SHAPE: 'constant', FACTOR: 40, PACKET_FACTOR: 1, PPS: 60, DURATION_SEC: 6 },
      { PROFILE: 'ntp', SHAPE: 'wave', FACTOR: 80, PACKET_FACTOR: 4, PPS: 60, DURATION_SEC: 6 },
      { PROFILE: 'memcached', SHAPE: 'burst', FACTOR: 100, PACKET_FACTOR: 8, PPS: 40, DURATION_SEC: 6 },
    ],
  },
  'mixed-flood-with-legit': {
    summary: 'Two attack profiles + benign traffic through the scrubber; realistic collateral.',
    useScrubber: true,
    withLegit: true,
    scrubber: { THRESHOLD_PPS: 100, CEILING_PPS: 40, DETECTION_DELAY_SEC: 2 },
    generators: [
      { PROFILE: 'dns', SHAPE: 'ramp', FACTOR: 40, PACKET_FACTOR: 2, PPS: 90, DURATION_SEC: 8 },
      { PROFILE: 'ssdp', SHAPE: 'constant', FACTOR: 30, PACKET_FACTOR: 3, PPS: 70, DURATION_SEC: 8 },
    ],
    legit: { PPS: 25, DURATION_SEC: 8 },
  },

  // --- Mitigation-strategy comparisons (same attack, different scrubber) ------
  'blocklist-mitigation': {
    summary: 'Signature-style blocklist: forward legit, drop attack — near-zero collateral.',
    useScrubber: true,
    withLegit: true,
    scrubber: { STRATEGY: 'blocklist', THRESHOLD_PPS: 80, CEILING_PPS: 30, DETECTION_DELAY_SEC: 2 },
    generator: { SHAPE: 'constant', PROFILE: 'dns', FACTOR: 40, PACKET_FACTOR: 3, PPS: 120, DURATION_SEC: 8 },
    legit: { PPS: 30, DURATION_SEC: 8 },
  },
  'adaptive-mitigation': {
    summary: 'Adaptive ceiling: loosens when it harms legit traffic, tightens when it does not.',
    useScrubber: true,
    withLegit: true,
    scrubber: { STRATEGY: 'adaptive', THRESHOLD_PPS: 100, CEILING_PPS: 30, DETECTION_DELAY_SEC: 2 },
    generator: { SHAPE: 'wave', PROFILE: 'ntp', FACTOR: 60, PACKET_FACTOR: 4, PPS: 140, DURATION_SEC: 10 },
    legit: { PPS: 30, DURATION_SEC: 10 },
  },

  // --- zeroBS DRS Volumetric vectors (report P25-20300) ----------------------
  // Bounded, synthetic realizations of the UDP amplification/rate vectors from a
  // zeroBS DDoS stress-test's Volumetric section. TCP/GRE/spoofing/fragmentation
  // vectors from that report are out of this bench's model (see the control
  // plane's bench catalogue) and are NOT reproduced here.
  udp_dns_reflection: {
    summary: 'zeroBS DRS3 — UDP DNS reflection (synthetic DNS-shape amplification).',
    useScrubber: false,
    generator: { PROFILE: 'dns', SHAPE: 'constant', FACTOR: 40, PACKET_FACTOR: 1, PPS: 120, DURATION_SEC: 6 },
  },
  udp_maxpackets: {
    summary: 'zeroBS DRS3 — UDP max-packets (high bounded packet rate; stresses the PPS path).',
    useScrubber: false,
    generator: { PROFILE: 'generic', SHAPE: 'constant', FACTOR: 1, PACKET_FACTOR: 10, PPS: 200, DURATION_SEC: 6 },
  },
  udp_multivector: {
    summary: 'zeroBS DRS4 — UDP multi-vector (several synthetic amplification profiles together).',
    useScrubber: false,
    generators: [
      { PROFILE: 'dns', SHAPE: 'constant', FACTOR: 40, PACKET_FACTOR: 1, PPS: 60, DURATION_SEC: 6 },
      { PROFILE: 'ntp', SHAPE: 'wave', FACTOR: 80, PACKET_FACTOR: 4, PPS: 60, DURATION_SEC: 6 },
      { PROFILE: 'ssdp', SHAPE: 'burst', FACTOR: 30, PACKET_FACTOR: 2, PPS: 50, DURATION_SEC: 6 },
      { PROFILE: 'memcached', SHAPE: 'constant', FACTOR: 100, PACKET_FACTOR: 8, PPS: 40, DURATION_SEC: 6 },
    ],
  },

  // --- zeroBS DRS Volumetric TCP vectors — no-spoof state-table pressure ------
  // Reproduces the connection/state-table EXHAUSTION shape of a TCP flood using
  // real connections from a real lab source (no source-IP spoofing, no raw
  // packets — the defining trait of a real SYN flood is deliberately absent).
  tcp_synflood: {
    kind: 'tcp',
    summary: 'zeroBS DRS3 — TCP SynFlood shape: no-spoof connection/state-table pressure.',
    target: { CAPACITY: 200 },
    generator: { RATE_CPS: 150, DURATION_SEC: 6, HOLD_MS: 8000 },
  },
  tcp_maxpackets: {
    kind: 'tcp',
    summary: 'zeroBS DRS3 — TCP MaxPackets shape: high bounded connection rate.',
    target: { CAPACITY: 300 },
    generator: { RATE_CPS: 250, DURATION_SEC: 6, HOLD_MS: 4000 },
  },

  // --- Cross-layer class-C ladder (control-plane `network-drs345`) ------------
  // Synthetic realisations of the additional reflection/flood SHAPES the control
  // plane pairs with an L7 playbook. Each reuses the same bounded reflector /
  // generator / tcp-target infrastructure — no new attack code, no real
  // reflector protocol, no source-IP spoofing. Ids match the control plane's
  // BENCH_SCENARIOS so the runner can execute a claimed request directly.
  udp_ntp_reflection: {
    summary: 'DRS3 — UDP NTP reflection (synthetic monlist-style burst shape).',
    useScrubber: false,
    generator: { PROFILE: 'ntp', SHAPE: 'constant', FACTOR: 100, PACKET_FACTOR: 6, PPS: 100, DURATION_SEC: 6 },
  },
  udp_ssdp_reflection: {
    summary: 'DRS3 — UDP SSDP/UPnP reflection (synthetic discovery-reply shape).',
    useScrubber: false,
    generator: { PROFILE: 'ssdp', SHAPE: 'constant', FACTOR: 30, PACKET_FACTOR: 1, PPS: 140, DURATION_SEC: 6 },
  },
  udp_cldap_reflection: {
    summary: 'DRS4 — UDP CLDAP reflection (synthetic directory-reply shape).',
    useScrubber: false,
    generator: { PROFILE: 'cldap', SHAPE: 'constant', FACTOR: 56, PACKET_FACTOR: 1, PPS: 120, DURATION_SEC: 6 },
  },
  udp_memcached_reflection: {
    summary: 'DRS4 — UDP memcached reflection (very high synthetic factor; clamped by the caps).',
    useScrubber: false,
    generator: { PROFILE: 'memcached', SHAPE: 'constant', FACTOR: 100, PACKET_FACTOR: 10, PPS: 80, DURATION_SEC: 6 },
  },
  quic_init_pressure: {
    summary: 'DRS4 — QUIC/UDP initial-handshake flood shape (many small packets; NOT amplification).',
    useScrubber: false,
    generator: { PROFILE: 'generic', SHAPE: 'constant', FACTOR: 1, PACKET_FACTOR: 1, PPS: 200, DURATION_SEC: 6 },
  },
  pulsewave_l34: {
    summary: 'DRS5 — PulseWave: synchronized on/off bursts across synthetic profiles.',
    useScrubber: false,
    generators: [
      { PROFILE: 'dns', SHAPE: 'burst', FACTOR: 40, PACKET_FACTOR: 2, PPS: 90, DURATION_SEC: 8 },
      { PROFILE: 'ntp', SHAPE: 'burst', FACTOR: 80, PACKET_FACTOR: 4, PPS: 70, DURATION_SEC: 8 },
    ],
  },
  tcp_conn_drain: {
    kind: 'tcp',
    summary: 'DRS4 — TCP slow connection drain: hold real connections to pressure the state table (no spoof).',
    target: { CAPACITY: 200 },
    generator: { RATE_CPS: 60, DURATION_SEC: 8, HOLD_MS: 15000 },
  },
};

export function scenarioNames() {
  return Object.keys(SCENARIOS);
}
