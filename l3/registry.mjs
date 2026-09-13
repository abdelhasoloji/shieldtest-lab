import { assertLabAddress } from '../lib/net-guard.mjs';
import { SOURCE_POOLS } from '../lib/source-pool.mjs';

// Pre-registered objects a spoofed L3 scenario may reference by ID. A scenario
// never carries a raw IP, hostname, interface name, CIDR or command — it names a
// registered target / source pool / profile, and every concrete value is resolved
// HERE, from a frozen registry. Fail-closed: an unknown id throws.

// --- Targets ---------------------------------------------------------------
// targetId -> exact private/loopback destination IP (through the hard net-guard
// gate) + the test interface it is reachable on + the unprivileged ports it
// exposes. The interface is a PROPERTY of the target, so the caller never picks
// one freely.
const TARGET_DEFS = [
  { id: 'synthetic-target-a', ip: '192.168.100.99', interfaceId: 'lab-test-a', ports: [9002] },
  { id: 'loopback-target', ip: '127.0.0.1', interfaceId: 'loopback-test', ports: [9002], testOnly: true },
];

export const L3_TARGETS = Object.freeze(
  Object.fromEntries(
    TARGET_DEFS.map((t) => {
      // Destination must pass the SAME hard RFC1918/loopback gate as every other
      // emitter in the lab — a target can never be a public address.
      assertLabAddress(t.ip, `target ${t.id}`);
      return [t.id, Object.freeze({ ...t, ports: Object.freeze([...t.ports]) })];
    }),
  ),
);

// --- Interfaces ------------------------------------------------------------
// interfaceId -> the local test interface. `isManagement` marks the management
// interface, which a spoofed test may NEVER use (enforced by the preflight in a
// later phase). A scenario references an interfaceId only via its target.
const INTERFACE_DEFS = [
  { id: 'lab-test-a', name: 'lab-veth-a', isManagement: false },
  { id: 'loopback-test', name: 'lo', isManagement: false, testOnly: true },
  { id: 'mgmt', name: 'mgmt0', isManagement: true },
];

export const L3_INTERFACES = Object.freeze(
  Object.fromEntries(INTERFACE_DEFS.map((i) => [i.id, Object.freeze({ ...i })])),
);

// --- Profiles (V1) ---------------------------------------------------------
// The full profile shape (ramp strategy, expected metrics, risk level) lands in a
// later phase; here each profile carries its ID, protocol, allowed ports, and the
// ABSOLUTE, hard-coded caps that NO environment variable can raise — so the
// scenario model can validate a requested load against them now. Deliberately low
// for a VM sim; a spoofed run can never exceed these.
const PROFILE_DEFS = [
  { id: 'udp-spoofed-constant', protocol: 'udp', ports: [9002], rampStrategy: 'constant', riskLevel: 'medium', absMaxPps: 200, absMaxDurationSec: 30, absMaxPacketSize: 512, absMaxSources: 256 },
  { id: 'udp-spoofed-ramp', protocol: 'udp', ports: [9002], rampStrategy: 'ramp', riskLevel: 'medium', absMaxPps: 200, absMaxDurationSec: 30, absMaxPacketSize: 512, absMaxSources: 256 },
  { id: 'udp-spoofed-burst', protocol: 'udp', ports: [9002], rampStrategy: 'burst', riskLevel: 'high', absMaxPps: 200, absMaxDurationSec: 20, absMaxPacketSize: 512, absMaxSources: 256 },
  { id: 'tcp-syn-spoofed-model', protocol: 'tcp', ports: [9002], rampStrategy: 'constant', riskLevel: 'high', absMaxPps: 200, absMaxDurationSec: 20, absMaxPacketSize: 64, absMaxSources: 256 },
];

export const L3_PROFILES = Object.freeze(
  Object.fromEntries(
    PROFILE_DEFS.map((p) => {
      if (!SOURCE_POOLS) throw new Error('source pools unavailable'); // import sanity
      return [p.id, Object.freeze({ ...p, ports: Object.freeze([...p.ports]) })];
    }),
  ),
);

/** Look up a registered target by id (fail-closed). */
export function getTarget(id) {
  const t = L3_TARGETS[id];
  if (!t) throw new Error(`unknown target: ${JSON.stringify(id)}`);
  return t;
}

/** Look up a registered interface by id (fail-closed). */
export function getInterface(id) {
  const i = L3_INTERFACES[id];
  if (!i) throw new Error(`unknown interface: ${JSON.stringify(id)}`);
  return i;
}

/** Look up a registered profile by id (fail-closed). */
export function getProfile(id) {
  const p = L3_PROFILES[id];
  if (!p) throw new Error(`unknown profile: ${JSON.stringify(id)}`);
  return p;
}
