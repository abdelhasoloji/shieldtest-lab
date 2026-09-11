import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadRegistry,
  assertAuthorizedTarget,
  verifyControl,
  clampToCaps,
  normalizeHost,
} from '../lib/target-guard.mjs';

const base = {
  host: 'bank.cz',
  verification: { method: 'dns-txt', name: '_shieldtest.bank.cz', token: 'tok-123' },
  window: 'always',
  caps: { maxRps: 200, maxStreams: 2000, maxDurationSec: 60, maxConcurrency: 64 },
};

test('fail-closed: an empty registry authorizes nothing', () => {
  assert.throws(() => assertAuthorizedTarget('bank.cz', { registry: new Map() }), /fail-closed/);
});

test('only a registered host is accepted; anything else is refused', () => {
  const reg = loadRegistry({ targets: [base] });
  assert.equal(assertAuthorizedTarget('bank.cz', { registry: reg }).host, 'bank.cz');
  assert.equal(assertAuthorizedTarget('BANK.CZ.', { registry: reg }).host, 'bank.cz'); // normalized
  assert.throws(() => assertAuthorizedTarget('evil.example', { registry: reg }), /not on the authorized allowlist/);
  assert.throws(() => assertAuthorizedTarget('bank.cz.evil.example', { registry: reg }), /not on the authorized allowlist/);
});

test('an expired authorization is refused', () => {
  const reg = loadRegistry({ targets: [{ ...base, expiresAt: '2020-01-01T00:00:00Z' }] });
  assert.throws(() => assertAuthorizedTarget('bank.cz', { registry: reg }), /expired/);
});

test('a run outside the authorized window is refused', () => {
  const reg = loadRegistry({
    targets: [{ ...base, window: { from: '2020-01-01T00:00:00Z', to: '2020-01-02T00:00:00Z' } }],
  });
  assert.throws(() => assertAuthorizedTarget('bank.cz', { registry: reg, now: Date.now() }), /window/);
});

test('domain-control verification requires the live TXT token', async () => {
  const reg = loadRegistry({ targets: [base] });
  const entry = assertAuthorizedTarget('bank.cz', { registry: reg });
  const ok = { resolveTxt: async () => [['tok-123']] };
  const missing = { resolveTxt: async () => [['other']] };
  const nxdomain = { resolveTxt: async () => { throw new Error('ENOTFOUND'); } };
  assert.equal(await verifyControl(entry, { resolver: ok }), true);
  await assert.rejects(verifyControl(entry, { resolver: missing }), /not proven/);
  await assert.rejects(verifyControl(entry, { resolver: nxdomain }), /not proven/);
});

test('clampToCaps never exceeds the target caps', () => {
  const c = clampToCaps({ rps: 10000, streams: 999999, durationSec: 3600, concurrency: 1000 }, base.caps);
  assert.deepEqual(c, { rps: 200, streams: 2000, durationSec: 60, concurrency: 64 });
});

test('normalizeHost lowercases and strips a trailing dot', () => {
  assert.equal(normalizeHost('  BANK.cz.  '), 'bank.cz');
});
