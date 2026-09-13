import { getProfile, getTarget, getInterface } from './registry.mjs';
import { getSourcePool } from '../lib/source-pool.mjs';

// Strict validator for a spoofed L3 scenario. A scenario references ONLY
// pre-registered objects (profileId / sourcePoolId / targetId) — every concrete
// address, interface and cap is resolved from the frozen registries, never taken
// from the input. Fail-closed: anything unexpected is rejected, and the mere
// PRESENCE of a raw-addressing / command / path field is a hard rejection so a
// caller can never smuggle a destination, interface or shell through.

const SCHEMA_VERSION = 1;

// Keys that must never appear — the escape hatches the mission forbids
// (arbitrary IP/host/URL/CIDR/interface/command/args/path/route/gateway). Their
// presence alone rejects the scenario.
const FORBIDDEN_KEYS = [
  'ip', 'destIp', 'sourceIp', 'host', 'hostname', 'url', 'cidr', 'sourceCidr',
  'interface', 'iface', 'interfaceName', 'command', 'cmd', 'args', 'argv',
  'file', 'path', 'route', 'gateway', 'nic',
];

const ALLOWED_KEYS = new Set([
  'schemaVersion', 'profileId', 'sourcePoolId', 'targetId', 'protocol',
  'destinationPort', 'packetSize', 'pps', 'durationSec', 'sourceCount', 'approval',
]);

function requirePositiveInt(value, max, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  if (n > max) {
    throw new Error(`${name} ${n} exceeds the absolute cap ${max}`);
  }
  return n;
}

/** Validate the approval REFERENCE block's shape only. The cryptographic token
 *  (signature, nonce, expiry) is verified in a later phase; here we just require
 *  the fields exist and are well-typed, so an unauthorized scenario can't even be
 *  shaped without them. */
function validateApprovalRef(a) {
  const o = a && typeof a === 'object' && !Array.isArray(a) ? a : null;
  if (!o) throw new Error('approval block is required');
  if (typeof o.campaignId !== 'string' || !o.campaignId.trim()) {
    throw new Error('approval.campaignId is required');
  }
  if (typeof o.profileDigest !== 'string' || !/^[a-f0-9]{64}$/i.test(o.profileDigest)) {
    throw new Error('approval.profileDigest must be a sha256 hex digest');
  }
  const expires = Date.parse(o.expiresAt);
  if (Number.isNaN(expires)) throw new Error('approval.expiresAt must be an ISO-8601 timestamp');
  return Object.freeze({
    campaignId: o.campaignId.trim(),
    profileDigest: o.profileDigest.toLowerCase(),
    expiresAt: new Date(expires).toISOString(),
  });
}

/**
 * Validate a spoofed L3 scenario, returning a frozen, fully-resolved scenario or
 * throwing (fail-closed). The returned object carries the resolved destination IP
 * and source-pool CIDR for downstream use, but those came from the registry — the
 * caller never supplied them.
 *
 * @param {unknown} input
 * @param {{ allowTestOnly?: boolean }} [opts] allow testOnly targets/pools (unit
 *        tests only; a real scenario never sets this).
 */
export function validateL3Scenario(input, opts = {}) {
  const o = input && typeof input === 'object' && !Array.isArray(input) ? input : null;
  if (!o) throw new Error('scenario must be an object');

  // 1) No forbidden fields, no unknown fields (fail-closed).
  for (const k of FORBIDDEN_KEYS) {
    if (k in o) {
      throw new Error(`forbidden field "${k}" — scenarios reference registered objects only`);
    }
  }
  for (const k of Object.keys(o)) {
    if (!ALLOWED_KEYS.has(k)) throw new Error(`unknown field "${k}"`);
  }

  if (o.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`schemaVersion must be ${SCHEMA_VERSION}`);
  }

  // 2) Resolve the referenced objects (each throws if unknown).
  const profile = getProfile(o.profileId);
  const pool = getSourcePool(o.sourcePoolId);
  const target = getTarget(o.targetId);
  // The interface is a property of the target, never chosen by the caller.
  const iface = getInterface(target.interfaceId);

  const allowTestOnly = opts.allowTestOnly === true;
  if (!allowTestOnly && (target.testOnly || pool.testOnly)) {
    throw new Error('test-only target/source-pool cannot be used by a real scenario');
  }
  if (iface.isManagement) {
    throw new Error('a spoofed scenario may never use the management interface');
  }

  // 3) Protocol + port: protocol must match the profile; the port must be one the
  //    target AND profile allow, and always unprivileged.
  if (o.protocol !== profile.protocol) {
    throw new Error(`protocol ${JSON.stringify(o.protocol)} does not match profile ${profile.id}`);
  }
  const port = Number(o.destinationPort);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('destinationPort must be an unprivileged port (1024–65535)');
  }
  if (!target.ports.includes(port) || !profile.ports.includes(port)) {
    throw new Error(`destinationPort ${port} is not allowed for this target/profile`);
  }

  // 4) Numeric limits, each within the profile's ABSOLUTE (env-immutable) cap.
  const pps = requirePositiveInt(o.pps, profile.absMaxPps, 'pps');
  const durationSec = requirePositiveInt(o.durationSec, profile.absMaxDurationSec, 'durationSec');
  const packetSize = requirePositiveInt(o.packetSize, profile.absMaxPacketSize, 'packetSize');
  const sourceCount = requirePositiveInt(
    o.sourceCount ?? Math.min(profile.absMaxSources, pool.maxSources),
    Math.min(profile.absMaxSources, pool.maxSources),
    'sourceCount',
  );

  // 5) Approval reference (full crypto verification is a later phase).
  const approval = validateApprovalRef(o.approval);

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    profileId: profile.id,
    sourcePoolId: pool.id,
    targetId: target.id,
    interfaceId: iface.id,
    protocol: profile.protocol,
    destinationPort: port,
    packetSize,
    pps,
    durationSec,
    sourceCount,
    // Resolved from the registry — NOT from the caller.
    resolved: Object.freeze({
      targetIp: target.ip,
      interfaceName: iface.name,
      sourcePoolCidr: pool.cidr,
    }),
    approval,
  });
}
