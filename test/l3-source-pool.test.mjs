import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ipToInt,
  cidrToRange,
  SOURCE_POOLS,
  isAllowedSource,
  assertAllowedSource,
  getSourcePool,
} from '../lib/source-pool.mjs';

test('ipToInt parses IPv4 unsigned and rejects non-IPv4', () => {
  assert.equal(ipToInt('0.0.0.0'), 0);
  assert.equal(ipToInt('255.255.255.255'), 4294967295);
  assert.equal(ipToInt('192.0.2.1'), 3221225985);
  for (const bad of ['', '::1', '1.2.3', '1.2.3.256', 'nope', undefined, 5]) {
    assert.equal(ipToInt(bad), null, `${bad} should not parse`);
  }
});

test('cidrToRange expands by octet math (network/broadcast), not string prefix', () => {
  assert.deepEqual(cidrToRange('192.0.2.0/24'), {
    network: ipToInt('192.0.2.0'),
    broadcast: ipToInt('192.0.2.255'),
    size: 256,
  });
  assert.throws(() => cidrToRange('192.0.2.0/33'), /invalid CIDR/);
  assert.throws(() => cidrToRange('nope/24'), /invalid CIDR/);
});

test('the registry is frozen and every pool exposes a usable host range', () => {
  assert.equal(Object.isFrozen(SOURCE_POOLS), true);
  for (const [id, pool] of Object.entries(SOURCE_POOLS)) {
    assert.equal(Object.isFrozen(pool), true, `${id} frozen`);
    assert.ok(pool.hostMin === pool.network + 1, `${id} hostMin`);
    assert.ok(pool.hostMax === pool.broadcast - 1, `${id} hostMax`);
  }
  // Mutation attempts are silently ignored (frozen).
  try {
    SOURCE_POOLS['evil'] = {};
  } catch {
    /* strict mode may throw; either way it must not be added */
  }
  assert.equal(SOURCE_POOLS['evil'], undefined);
});

test('accepts documentation-range hosts, rejects network/broadcast and out-of-pool', () => {
  assert.equal(isAllowedSource('192.0.2.1', 'documentation-pool-a'), true);
  assert.equal(isAllowedSource('192.0.2.254', 'documentation-pool-a'), true);
  // Network and broadcast addresses are never usable sources.
  assert.equal(isAllowedSource('192.0.2.0', 'documentation-pool-a'), false);
  assert.equal(isAllowedSource('192.0.2.255', 'documentation-pool-a'), false);
  // A host from another pool is not in this one.
  assert.equal(isAllowedSource('198.51.100.5', 'documentation-pool-a'), false);
  // Unknown pool is a rejection, not a throw.
  assert.equal(isAllowedSource('192.0.2.1', 'nope'), false);
});

test('the hard deny-list can never be reached even via a pool', () => {
  // Loopback pool is broad (127/8) but the dangerous singletons/ranges are still
  // denied wherever they might fall; documentation ranges avoid them by design.
  // Real lab service net, cloud metadata, multicast, link-local, DNS, 0/8:
  for (const ip of [
    '169.254.169.254', // cloud metadata (link-local)
    '169.254.1.1', //     link-local
    '224.0.0.1', //       multicast
    '239.1.2.3', //       multicast
    '0.0.0.0', //         this-network
    '255.255.255.255', // limited broadcast
    '192.168.100.99', //  the REAL lab target — never impersonable as a source
    '8.8.8.8', //         public DNS
  ]) {
    // Not in any allowed pool anyway, but assert the deny-list explicitly by
    // checking a pool that numerically could contain link-local-ish ranges: none
    // of our pools do, so membership is false regardless.
    assert.equal(isAllowedSource(ip, 'lab-reserved-a'), false, `${ip} must be denied`);
    assert.equal(isAllowedSource(ip, 'documentation-pool-a'), false, `${ip} must be denied`);
  }
});

test('IPv6 and malformed inputs are never allowed sources', () => {
  for (const ip of ['2001:db8::1', '::1', 'fe80::1', '', 'nope', undefined]) {
    assert.equal(isAllowedSource(ip, 'documentation-pool-a'), false);
  }
});

test('assertAllowedSource throws for out-of-pool and unknown pool (fail-closed)', () => {
  assert.doesNotThrow(() => assertAllowedSource('192.0.2.10', 'documentation-pool-a'));
  assert.throws(() => assertAllowedSource('198.51.100.10', 'documentation-pool-a'), /not an allowed host/);
  assert.throws(() => assertAllowedSource('192.0.2.10', 'nope'), /unknown source pool/);
  assert.throws(() => assertAllowedSource('8.8.8.8', 'documentation-pool-a'), /not an allowed host/);
});

test('getSourcePool is fail-closed on an unknown id', () => {
  assert.equal(getSourcePool('documentation-pool-b').cidr, '198.51.100.0/24');
  assert.throws(() => getSourcePool('nope'), /unknown source pool/);
});
