import { assertLabAddress } from '../lib/net-guard.mjs';

// Profiles now live in their own authoritative module; re-exported here so the
// existing `getProfile`/`L3_PROFILES` imports keep resolving from the registry.
export { L3_PROFILES, getProfile, listProfiles, L3_ABSOLUTE_CEILING } from './profiles.mjs';

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

// Profiles (V1) are defined in ./profiles.mjs and re-exported at the top of this
// module. `getProfile` / `L3_PROFILES` therefore still resolve from the registry.

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
