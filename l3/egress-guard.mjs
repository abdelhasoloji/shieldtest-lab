import { isAllowedSource } from '../lib/source-pool.mjs';

// Independent egress guard for a spoofed L3 scenario.
//
// This module is a TESTABLE POLICY REPRESENTATION plus a classifier — it does NOT
// touch the host firewall. It expresses "default DROP; accept only the exact
// destination, the approved source pool, the scenario protocol/port, and only up
// to the PPS/bit-per-second caps", drops everything else, and counts what it
// accepted vs dropped (with reasons). The real system application lives behind an
// explicit, injected executor (`applyEgressPolicy`) that CI/tests never call.

/** Build the immutable egress policy for a validated L3 scenario. bps cap is
 *  derived from pps × packetSize with no headroom (bytes → bits). */
export function buildEgressPolicy(scenario) {
  return Object.freeze({
    destIp: scenario.resolved.targetIp,
    destPort: scenario.destinationPort,
    protocol: scenario.protocol,
    sourcePoolId: scenario.sourcePoolId,
    ppsCap: scenario.pps,
    bpsCap: scenario.pps * scenario.packetSize * 8,
    packetSizeMax: scenario.packetSize,
    defaultAction: 'DROP',
  });
}

// Tiny tolerance so a legitimately-capped stream isn't dropped on rounding at the
// window edge; anything beyond this is a real overshoot and gets dropped.
const RATE_TOLERANCE = 1.02;

/**
 * Stateful guard: classify each outgoing packet descriptor against the policy in
 * a 1-second sliding window. Any non-conforming packet is DROPPED and counted by
 * reason. Pure in-memory — safe under `node --test`, no privileges.
 */
export function createEgressGuard(policy) {
  let accepted = 0;
  let acceptedBytes = 0;
  let dropped = 0;
  const dropReasons = Object.create(null);
  // 1s sliding window of accepted packets: [{ t, bytes }]
  let window = [];

  const drop = (reason) => {
    dropped += 1;
    dropReasons[reason] = (dropReasons[reason] ?? 0) + 1;
    return { action: 'DROP', reason };
  };

  const trim = (now) => {
    const cutoff = now - 1000;
    if (window.length && window[0].t <= cutoff) {
      window = window.filter((e) => e.t > cutoff);
    }
  };

  /** @param {{srcIp:string,dstIp:string,dstPort:number,protocol:string,bytes:number}} pkt */
  const classify = (pkt, now = Date.now()) => {
    if (!pkt || typeof pkt !== 'object') return drop('malformed');
    if (pkt.protocol !== policy.protocol) return drop('protocol-mismatch');
    if (pkt.dstIp !== policy.destIp) return drop('destination-mismatch');
    if (pkt.dstPort !== policy.destPort) return drop('port-mismatch');
    if (!isAllowedSource(pkt.srcIp, policy.sourcePoolId)) return drop('source-not-in-pool');
    const bytes = Number(pkt.bytes);
    if (!Number.isInteger(bytes) || bytes < 1 || bytes > policy.packetSizeMax) {
      return drop('oversize');
    }
    trim(now);
    const windowPkts = window.length + 1;
    const windowBytes = window.reduce((s, e) => s + e.bytes, 0) + bytes;
    if (windowPkts > policy.ppsCap * RATE_TOLERANCE) return drop('pps-cap');
    if (windowBytes * 8 > policy.bpsCap * RATE_TOLERANCE) return drop('bps-cap');
    window.push({ t: now, bytes });
    accepted += 1;
    acceptedBytes += bytes;
    return { action: 'ACCEPT' };
  };

  return {
    classify,
    snapshot() {
      return {
        accepted,
        acceptedBytes,
        dropped,
        dropReasons: { ...dropReasons },
        defaultAction: policy.defaultAction,
      };
    },
    /** Guaranteed cleanup: clears in-memory state after a run. */
    reset() {
      accepted = 0;
      acceptedBytes = 0;
      dropped = 0;
      for (const k of Object.keys(dropReasons)) delete dropReasons[k];
      window = [];
    },
  };
}

/** Pure renderer: the nftables ruleset the policy WOULD install (default drop,
 *  single accept for the exact 5-tuple + rate limit). Text only — never executed
 *  here; used for review, evidence, and by the system adapter. */
export function renderNftRules(policy) {
  const proto = policy.protocol === 'tcp' ? 'tcp' : 'udp';
  return [
    'table inet shieldtest_l3_egress {',
    '  chain output {',
    '    type filter hook output priority 0; policy drop;',
    `    ip daddr ${policy.destIp} ${proto} dport ${policy.destPort} \\`,
    `      limit rate ${policy.ppsCap}/second accept;`,
    '    counter drop;',
    '  }',
    '}',
  ].join('\n');
}

/**
 * System adapter. By design a NO-OP unless BOTH `enabled` is true AND a real
 * `exec` executor is injected. CI and unit tests always call with enabled:false
 * (or omit exec), so no host firewall is ever touched. Fail-closed: enabled with
 * no executor throws rather than silently doing nothing.
 */
export function applyEgressPolicy(policy, { enabled = false, exec } = {}) {
  const plan = renderNftRules(policy);
  if (!enabled) return { applied: false, plan };
  if (typeof exec !== 'function') {
    throw new Error('applyEgressPolicy: enabled but no exec executor injected (fail-closed)');
  }
  exec(plan);
  return { applied: true, plan };
}
