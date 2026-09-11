import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCampaign, defaultHealthProbe } from '../external/run-campaign.mjs';
import { campaignNames, describeCampaign, resolveCampaign } from '../external/campaigns.mjs';
import { loadRegistry } from '../lib/target-guard.mjs';
import { createH2TestTarget } from '../external/h2-test-target.mjs';

const registry = (caps = { maxRps: 50, maxStreams: 500, maxDurationSec: 10, maxConcurrency: 16 }) =>
  loadRegistry({
    targets: [
      { host: 'bank.cz', authorizationRef: 'REF-1', verification: { method: 'dns-txt', token: 't' }, window: 'always', caps },
    ],
  });

// A fake vector: records calls, returns a summary with a chosen outcome shape.
const fakeVector = (over = {}) => {
  const calls = [];
  const fn = async (args) => {
    calls.push(args.requested);
    return { kind: 'http2-rapid-reset', target: 'bank.cz', opened: 50, resetsSent: 50, responses: 50, errors: 0, goaway: false, effective: {}, effectiveRps: 25, durationMs: 100, ...over };
  };
  return { map: { 'http2-rapid-reset': fn }, calls };
};

const noSleep = () => Promise.resolve();
const healthy = async () => ({ healthy: true, latencyMs: 1 });

test('the catalogue only resolves named campaigns', () => {
  assert.ok(campaignNames().includes('h2-ramp'));
  assert.throws(() => resolveCampaign('anything-goes'), /must be one of the named campaigns/);
  assert.equal(describeCampaign('h2-smoke').steps.length, 1);
});

test('unknown campaign is refused', async () => {
  await assert.rejects(
    runCampaign({ campaign: 'nope', target: 'bank.cz', registry: registry(), runVector: fakeVector().map }),
    /must be one of the named campaigns/,
  );
});

test('fail-closed: empty registry / unauthorized target', async () => {
  await assert.rejects(runCampaign({ campaign: 'h2-smoke', target: 'bank.cz', registry: new Map() }), /fail-closed/);
  await assert.rejects(
    runCampaign({ campaign: 'h2-smoke', target: 'evil.example', registry: registry() }),
    /not on the authorized allowlist/,
  );
});

test('dry-run returns the full capped plan and sends no traffic', async () => {
  const v = fakeVector();
  const plan = await runCampaign({ campaign: 'h2-ramp', target: 'bank.cz', registry: registry(), dryRun: true, runVector: v.map });
  assert.equal(plan.event, 'campaign.dry-run');
  assert.equal(plan.steps.length, 3);
  // every step clamped to the target caps (maxRps 50, maxStreams 500, maxDurationSec 10)
  assert.ok(plan.steps.every((s) => s.rps <= 50 && s.streams <= 500 && s.durationSec <= 10));
  assert.equal(v.calls.length, 0, 'dry-run never invoked a vector');
});

test('execute: all steps run and aggregate to RESILIENT', async () => {
  const v = fakeVector();
  const seen = [];
  const verdict = await runCampaign({
    campaign: 'h2-ramp', target: 'bank.cz', registry: registry(), dryRun: false,
    runVector: v.map, healthProbe: healthy, sleep: noSleep, onStep: (s) => seen.push(s.index),
  });
  assert.equal(verdict.schema, 'shieldtest.external.campaign/v1');
  assert.equal(verdict.stepsExecuted, 3);
  assert.equal(verdict.aborted, false);
  assert.equal(verdict.outcome, 'RESILIENT');
  assert.deepEqual(seen, [0, 1, 2]);
  assert.equal(v.calls.length, 3);
});

test('circuit-breaker: an unhealthy probe stops the campaign (ABORTED)', async () => {
  const v = fakeVector();
  let n = 0;
  const probe = async () => (++n >= 1 ? { healthy: false, error: 'latency' } : { healthy: true });
  const verdict = await runCampaign({
    campaign: 'h2-ramp', target: 'bank.cz', registry: registry(), dryRun: false,
    runVector: v.map, healthProbe: probe, sleep: noSleep,
  });
  assert.equal(verdict.aborted, true);
  assert.equal(verdict.stepsExecuted, 1, 'stopped after the first step');
  assert.equal(verdict.outcome, 'ABORTED');
  assert.match(verdict.abortReason, /health probe failed/);
});

test('a degraded step makes the campaign DEGRADED', async () => {
  const v = fakeVector({ errors: 50 }); // 50/50 -> error rate 1.0 -> DEGRADED
  const verdict = await runCampaign({
    campaign: 'h2-smoke', target: 'bank.cz', registry: registry(), dryRun: false,
    runVector: v.map, healthProbe: healthy, sleep: noSleep,
  });
  assert.equal(verdict.outcome, 'DEGRADED');
});

test('the default health probe reports healthy against a live h2 target', async () => {
  const target = createH2TestTarget({ LISTEN_HOST: '127.0.0.1', LISTEN_PORT: '0' });
  const { port } = await target.start();
  try {
    const h = await defaultHealthProbe(`http://127.0.0.1:${port}/`);
    assert.equal(h.healthy, true);
  } finally {
    await target.stop();
  }
});
