import { execFileSync } from 'node:child_process';

// REAL system probes for the confinement preflight.
//
// ⚠ This module performs real, read-only host inspection (routes, Docker network
// state). It is a SEPARATE adapter, injected explicitly by an operator running a
// real spoofed campaign — it is NEVER imported by the tests or exercised in CI
// (which always pass fake probes). It only READS system state; it never emits a
// packet and never mutates the host. Not production-ready until validated on the
// real WEDOS lab infrastructure.
//
// No shell is ever used: every command runs via execFile with an argv array, and
// interface/network names are validated against a strict charset before use, so
// nothing is interpolated into a shell.

const SAFE_NAME = /^[A-Za-z0-9_.:-]{1,64}$/;

function assertSafeName(name, what) {
  if (typeof name !== 'string' || !SAFE_NAME.test(name)) {
    throw new Error(`unsafe ${what} name: ${JSON.stringify(name)}`);
  }
  return name;
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
}

/**
 * Build the real ConfinementProbes. `opts.managementInterface` is the operator's
 * declared management interface name (from local config, never the wire).
 */
export function realConfinementProbes({ managementInterface } = {}) {
  assertSafeName(managementInterface ?? '', 'management interface');
  return {
    interfaceHasDefaultRoute(iface) {
      assertSafeName(iface, 'interface');
      const out = run('ip', ['-o', 'route', 'show', 'default', 'dev', iface]);
      return out.trim().length > 0;
    },
    interfaceCanReachInternet(iface) {
      assertSafeName(iface, 'interface');
      // A route to a public anchor via this interface would mean it can egress.
      const out = run('ip', ['-o', 'route', 'get', '1.1.1.1', 'oif', iface]).trim();
      // Fail-closed: if the route resolves through this iface, treat as reachable.
      return out.length > 0 && !/unreachable/.test(out);
    },
    destinationDirectlyAttached(iface, destIp) {
      assertSafeName(iface, 'interface');
      assertSafeName(destIp, 'destination');
      const out = run('ip', ['-o', 'route', 'get', destIp, 'oif', iface]).trim();
      // Directly attached ⇒ the route is a "scope link" (no gateway "via").
      return out.length > 0 && !/ via /.test(out);
    },
    observedDestinationOnInterface(/* iface */) {
      // The concrete peer the test interface is wired to is operator-declared lab
      // state; the real adapter reads it from local config, not from the wire.
      throw new Error('observedDestinationOnInterface must be supplied by local lab config');
    },
    managementInterfaceName() {
      return managementInterface;
    },
    dockerNetworkIsInternal(net) {
      assertSafeName(net, 'docker network');
      const out = run('docker', ['network', 'inspect', net, '--format', '{{.Internal}}']);
      return out.trim() === 'true';
    },
    watchdogActive() {
      throw new Error('watchdogActive must be wired to the kill-switch supervisor (later phase)');
    },
    captureReady() {
      throw new Error('captureReady must be wired to the capture subsystem (later phase)');
    },
    previousStateClean() {
      throw new Error('previousStateClean must be wired to run-state cleanup (later phase)');
    },
    anotherSpoofCampaignActive() {
      throw new Error('anotherSpoofCampaignActive must be wired to the run registry (later phase)');
    },
  };
}
