import net from 'node:net';

// Lab-address guard.
//
// By default the lab must never emit UDP toward a public address — even when a
// component is run directly with `node` outside the isolated Docker network.
// The earlier guard trusted an env-overridable string prefix
// (`startsWith(LAB_CIDR_PREFIX)`), which an empty prefix defeats. This validates,
// by real octet math, that a destination is a private/loopback IPv4.
//
// Fork extension (abdelhasoloji): set `ALLOW_PUBLIC_TARGETS=1` to widen the gate
// to ANY valid IPv4 address, so the reflector/generator can amplify an arbitrary
// target (e.g. 46.28.109.92). The hard caps on factor / response size / packet
// factor / PPS / duration still apply — only the destination restriction is lifted.

const PRIVATE_V4 = [
  { label: '10.0.0.0/8', test: (o) => o[0] === 10 },
  { label: '172.16.0.0/12', test: (o) => o[0] === 172 && o[1] >= 16 && o[1] <= 31 },
  { label: '192.168.0.0/16', test: (o) => o[0] === 192 && o[1] === 168 },
  { label: '127.0.0.0/8', test: (o) => o[0] === 127 },
];

/** True only for an RFC1918 or loopback IPv4 address. */
export function isLabAddress(ip) {
  if (typeof ip !== 'string' || !net.isIPv4(ip)) return false;
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return PRIVATE_V4.some((r) => r.test(o));
}

/** True for any valid IPv4 address (used when ALLOW_PUBLIC_TARGETS=1). */
export function isAnyIPv4(ip) {
  if (typeof ip !== 'string' || !net.isIPv4(ip)) return false;
  const o = ip.split('.').map(Number);
  return o.length === 4 && o.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
}

/** True when the public-targets escape hatch is enabled via env. */
export function allowPublicTargets(env = process.env) {
  const v = String(env.ALLOW_PUBLIC_TARGETS ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Throws unless `ip` is a private/loopback IPv4 (the hard gate), or any IPv4 when ALLOW_PUBLIC_TARGETS=1. */
export function assertLabAddress(ip, name = 'address', env = process.env) {
  if (allowPublicTargets(env)) {
    if (!isAnyIPv4(ip)) {
      throw new Error(`${name} must be a valid IPv4 address; got ${JSON.stringify(ip)}`);
    }
    return ip;
  }
  if (!isLabAddress(ip)) {
    throw new Error(
      `${name} must be a private/loopback IPv4 (RFC1918 or 127/8) inside the closed lab; got ${JSON.stringify(ip)} ` +
        `(set ALLOW_PUBLIC_TARGETS=1 to allow public targets)`,
    );
  }
  return ip;
}

/**
 * Applies the hard private-range gate (or any-IPv4 when ALLOW_PUBLIC_TARGETS=1),
 * then an OPTIONAL extra narrowing to a specific lab prefix. The prefix can only
 * narrow — it can never widen the gate (an empty/absent prefix still leaves the
 * base gate).
 */
export function assertLabAddressInPrefix(ip, prefix, name = 'address', env = process.env) {
  assertLabAddress(ip, name, env);
  const p = typeof prefix === 'string' ? prefix.trim() : '';
  if (p && !ip.startsWith(p)) {
    throw new Error(`${name} ${ip} is outside the configured lab prefix ${p}`);
  }
  return ip;
}
