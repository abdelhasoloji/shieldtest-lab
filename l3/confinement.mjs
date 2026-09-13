// Confinement preflight for a spoofed L3 scenario → a ConfinementCertificate
// with a final GO / NO_GO decision.
//
// All system observations come from an INJECTED `probes` object, so the whole
// preflight runs under `node --test` with fakes — no root, no network access, no
// Docker. The real probes (reading routes, Docker network state, etc.) live in a
// separate module and are never invoked here or in CI. Fail-closed: a missing
// probe, or any probe that throws, makes its check fail (NO_GO), never GO.

/**
 * Required probe surface. Each returns the OBSERVED system fact; the preflight
 * decides GO/NO_GO. Sync or async both accepted.
 *
 * @typedef {Object} ConfinementProbes
 * @property {(iface:string)=>boolean} interfaceHasDefaultRoute
 * @property {(iface:string)=>boolean} interfaceCanReachInternet
 * @property {(iface:string,destIp:string)=>boolean} destinationDirectlyAttached
 * @property {(iface:string)=>string} observedDestinationOnInterface  // the dest the iface is wired to
 * @property {()=>string} managementInterfaceName
 * @property {(dockerNet:string)=>boolean} dockerNetworkIsInternal
 * @property {()=>boolean} watchdogActive
 * @property {()=>boolean} captureReady
 * @property {()=>boolean} previousStateClean
 * @property {()=>boolean} anotherSpoofCampaignActive
 */

const REQUIRED_PROBES = [
  'interfaceHasDefaultRoute',
  'interfaceCanReachInternet',
  'destinationDirectlyAttached',
  'observedDestinationOnInterface',
  'managementInterfaceName',
  'dockerNetworkIsInternal',
  'watchdogActive',
  'captureReady',
  'previousStateClean',
  'anotherSpoofCampaignActive',
];

async function safe(fn) {
  // A probe that throws is treated as a FAILED observation (fail-closed), never
  // as a pass. Returns { value, error }.
  try {
    return { value: await fn(), error: null };
  } catch (err) {
    return { value: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Run the preflight and return a ConfinementCertificate. `scenario` is a
 * validated L3 scenario; `dockerNet` names the internal lab network to verify.
 */
export async function runConfinementPreflight(scenario, probes, { dockerNet = 'shieldtest_lab' } = {}) {
  if (!probes || typeof probes !== 'object') {
    throw new Error('confinement preflight requires an injected probes object (fail-closed)');
  }
  for (const name of REQUIRED_PROBES) {
    if (typeof probes[name] !== 'function') {
      throw new Error(`confinement preflight: missing probe "${name}" (fail-closed)`);
    }
  }

  const ifaceName = scenario.resolved.interfaceName;
  const destIp = scenario.resolved.targetIp;
  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, ok: ok === true, detail });

  // A check PASSES only when the probe returns the safe value with no error.
  const expect = async (id, fn, safeValue, detail) => {
    const { value, error } = await safe(fn);
    add(id, error === null && value === safeValue, error ? `probe error: ${error}` : detail);
    return value;
  };

  await expect('no-default-route', () => probes.interfaceHasDefaultRoute(ifaceName), false,
    'test interface must have NO default route');
  await expect('no-internet-reach', () => probes.interfaceCanReachInternet(ifaceName), false,
    'test interface must not reach the Internet');
  await expect('destination-attached', () => probes.destinationDirectlyAttached(ifaceName, destIp), true,
    'destination must be directly attached to the lab network on the test interface');
  const observedDest = await safe(() => probes.observedDestinationOnInterface(ifaceName));
  add('destination-matches-target', observedDest.error === null && observedDest.value === destIp,
    observedDest.error ? `probe error: ${observedDest.error}` : `observed ${observedDest.value} vs target ${destIp}`);
  const mgmt = await safe(() => probes.managementInterfaceName());
  add('test-iface-not-management', mgmt.error === null && mgmt.value !== ifaceName,
    mgmt.error ? `probe error: ${mgmt.error}` : `management=${mgmt.value}, test=${ifaceName}`);
  await expect('docker-network-internal', () => probes.dockerNetworkIsInternal(dockerNet), true,
    `Docker network ${dockerNet} must be internal:true`);
  await expect('watchdog-active', () => probes.watchdogActive(), true, 'kill-switch watchdog must be active');
  await expect('capture-ready', () => probes.captureReady(), true, 'capture mechanism must be ready');
  await expect('previous-state-clean', () => probes.previousStateClean(), true, 'previous run state must be cleaned');
  await expect('no-active-spoof-campaign', () => probes.anotherSpoofCampaignActive(), false,
    'no other spoofed campaign may be active');

  const decision = checks.every((c) => c.ok) ? 'GO' : 'NO_GO';

  return Object.freeze({
    kind: 'shieldtest.l3.confinement-certificate/v1',
    timestamp: new Date().toISOString(),
    interfaces: Object.freeze({ test: ifaceName, management: mgmt.value ?? null }),
    routes: Object.freeze({
      testInterfaceHasDefaultRoute: checks.find((c) => c.id === 'no-default-route')?.ok === false,
    }),
    sourcePool: scenario.sourcePoolId,
    destination: Object.freeze({ targetId: scenario.targetId, ip: destIp, port: scenario.destinationPort }),
    limits: Object.freeze({ pps: scenario.pps, durationSec: scenario.durationSec, packetSize: scenario.packetSize }),
    profile: scenario.profileId,
    digest: scenario.approval.profileDigest,
    dockerNetwork: dockerNet,
    checks: Object.freeze(checks.map((c) => Object.freeze(c))),
    decision,
  });
}
