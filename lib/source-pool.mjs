import net from 'node:net';

// Immutable registry of ALLOWED spoofed-source pools for the closed L3 lab.
//
// A forged SOURCE address is a dangerous capability, so — unlike net-guard's
// destination gate (RFC1918/loopback only) — this restricts which spoofed source
// addresses a scenario may draw from, by exact numeric (u32) range, NEVER a
// string prefix and NEVER a value supplied over the wire or via env. The registry
// is frozen and hard-coded.
//
// V1 allows only ranges that are, in practice, non-routable on the public
// Internet and reserved for documentation/lab use:
//   - RFC 5737 documentation ranges (TEST-NET-1/2/3)
//   - an explicitly lab-reserved private /24 (distinct from the real service net)
//   - loopback (unit tests only)
// It NEVER allows real public IPs, the VPS/management/cloud-metadata/DNS/docker
// gateway/broadcast/network addresses, the real lab service subnet, or IPv6.

/** Parse a dotted IPv4 to an unsigned 32-bit integer, or null if not valid IPv4.
 *  Uses multiplication (not `<<`) so the result is always unsigned. */
export function ipToInt(ip) {
  if (typeof ip !== 'string' || !net.isIPv4(ip)) return null;
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((o[0] * 256 + o[1]) * 256 + o[2]) * 256 + o[3];
}

/** Expand a CIDR to { network, broadcast, size } as u32 integers. Throws on a
 *  malformed CIDR. Pure octet/bit math — no prefix-string matching. */
export function cidrToRange(cidr) {
  const [base, bitsStr] = String(cidr).split('/');
  const baseInt = ipToInt(base);
  const bits = Number(bitsStr);
  if (baseInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    throw new Error(`invalid CIDR: ${JSON.stringify(cidr)}`);
  }
  const size = 2 ** (32 - bits);
  const network = Math.floor(baseInt / size) * size;
  return { network, broadcast: network + size - 1, size };
}

// Hard-coded pool allowlist. `maxSources` bounds how many distinct forged
// sources a scenario may draw from this pool. `testOnly` pools exist purely for
// the unit-test harness and are never selectable by a real scenario (enforced by
// the scenario model / preflight, not here).
const POOL_DEFS = [
  { id: 'documentation-pool-a', label: 'RFC5737 TEST-NET-1', cidr: '192.0.2.0/24', maxSources: 256 },
  { id: 'documentation-pool-b', label: 'RFC5737 TEST-NET-2', cidr: '198.51.100.0/24', maxSources: 256 },
  { id: 'documentation-pool-c', label: 'RFC5737 TEST-NET-3', cidr: '203.0.113.0/24', maxSources: 256 },
  { id: 'lab-reserved-a', label: 'Lab-reserved private /24', cidr: '192.168.101.0/24', maxSources: 256 },
  { id: 'loopback-test', label: 'Loopback (unit tests only)', cidr: '127.0.0.0/8', maxSources: 1024, testOnly: true },
];

/** Frozen registry: sourcePoolId -> pool with numeric bounds and usable host
 *  range (network+1 .. broadcast-1, so a forged source is never the network or
 *  broadcast address). */
export const SOURCE_POOLS = Object.freeze(
  Object.fromEntries(
    POOL_DEFS.map((d) => {
      const { network, broadcast, size } = cidrToRange(d.cidr);
      return [
        d.id,
        Object.freeze({
          ...d,
          network,
          broadcast,
          size,
          hostMin: network + 1,
          hostMax: broadcast - 1,
        }),
      ];
    }),
  ),
);

// Defense-in-depth deny-list, checked IN ADDITION to pool membership: even a
// future mistaken pool edit can never re-authorize these as a spoofed source.
// Whole ranges are held as [min,max] u32 pairs; singletons as a Set.
const FORBIDDEN_RANGES = [
  ['0.0.0.0', '0.255.255.255'], //        this-network / unspecified (0.0.0.0/8)
  ['169.254.0.0', '169.254.255.255'], //  link-local incl. cloud metadata 169.254.169.254
  ['224.0.0.0', '239.255.255.255'], //    multicast (224.0.0.0/4)
  ['240.0.0.0', '255.255.255.255'], //    reserved/future + limited broadcast
  ['192.168.100.0', '192.168.100.255'], // the REAL lab service net — never impersonate a live lab host
].map(([a, b]) => [ipToInt(a), ipToInt(b)]);

const FORBIDDEN_SINGLETONS = new Set(
  ['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1'].map(ipToInt), // public DNS resolvers
);

function isForbiddenSource(int) {
  if (FORBIDDEN_SINGLETONS.has(int)) return true;
  return FORBIDDEN_RANGES.some(([min, max]) => int >= min && int <= max);
}

/** True only when `ip` is a usable host inside the named pool AND not on the hard
 *  deny-list. IPv6 and malformed input are always false. */
export function isAllowedSource(ip, poolId) {
  const pool = SOURCE_POOLS[poolId];
  if (!pool) return false;
  const int = ipToInt(ip);
  if (int === null) return false;
  if (isForbiddenSource(int)) return false;
  return int >= pool.hostMin && int <= pool.hostMax;
}

/** Throws unless `ip` is an allowed host in the named pool (the hard source gate).
 *  Fail-closed: an unknown pool id is itself a rejection. */
export function assertAllowedSource(ip, poolId, name = 'source address') {
  if (!SOURCE_POOLS[poolId]) {
    throw new Error(`unknown source pool: ${JSON.stringify(poolId)}`);
  }
  if (!isAllowedSource(ip, poolId)) {
    throw new Error(
      `${name} ${JSON.stringify(ip)} is not an allowed host in source pool ${poolId}`,
    );
  }
  return ip;
}

/** Look up a pool by id, throwing (fail-closed) when it is unknown. */
export function getSourcePool(poolId) {
  const pool = SOURCE_POOLS[poolId];
  if (!pool) throw new Error(`unknown source pool: ${JSON.stringify(poolId)}`);
  return pool;
}
