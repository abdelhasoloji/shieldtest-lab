import fs from 'node:fs';
import http2 from 'node:http2';
import { loadRegistry, assertAuthorizedTarget, verifyControl, clampToCaps } from '../lib/target-guard.mjs';
import { resolveCampaign } from './campaigns.mjs';
import { VECTORS } from './run-external.mjs';
import { toExternalVerdict, toCampaignVerdict } from './verdict.mjs';

// Campaign orchestrator for external authorized resilience tests.
//
// A campaign is a named, allowlisted plan (external/campaigns.mjs) of governed
// steps against ONE authorized target. Governance carries over from a single
// run and adds a circuit-breaker between steps:
//   - the target is authorized + domain-control re-verified ONCE up front;
//   - every step is clamped to the target caps and the vector HARD ceilings;
//   - after each step a health probe decides whether to continue — if the target
//     is degrading, the campaign STOPS instead of ramping further;
//   - DRY_RUN is the default: it proves authorization and returns the full capped
//     plan without sending any traffic.

const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal default health probe: one HTTP/2 GET; unhealthy on error/timeout. */
export async function defaultHealthProbe(url, { timeoutMs = 3000 } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    let client;
    try {
      client = http2.connect(new URL(url).origin);
    } catch {
      return finish({ healthy: false, error: 'connect-failed' });
    }
    client.on('error', () => finish({ healthy: false, error: 'client-error' }));
    const t = setTimeout(() => {
      finish({ healthy: false, error: 'timeout' });
      try {
        client.close();
      } catch {}
    }, timeoutMs);
    const started = Date.now();
    try {
      const req = client.request({ ':path': '/', ':method': 'GET' });
      req.on('response', () => {
        clearTimeout(t);
        finish({ healthy: true, latencyMs: Date.now() - started });
        req.close();
        try {
          client.close();
        } catch {}
      });
      req.on('error', () => {
        clearTimeout(t);
        finish({ healthy: false, error: 'stream-error' });
        try {
          client.close();
        } catch {}
      });
      req.end();
    } catch {
      clearTimeout(t);
      finish({ healthy: false, error: 'request-failed' });
    }
  });
}

/**
 * Run a named campaign against an authorized target.
 * Dependencies are injectable for tests: `runVector`, `healthProbe`, `sleep`.
 */
export async function runCampaign({
  campaign,
  target,
  registry,
  scheme = 'https',
  dryRun = true,
  verify = false,
  resolver,
  now = Date.now(),
  runVector,
  healthProbe = defaultHealthProbe,
  sleep = sleepReal,
  onStep,
} = {}) {
  const plan = resolveCampaign(campaign); // throws on unknown campaign
  const entry = assertAuthorizedTarget(target, { registry, now }); // fail-closed gate
  if (verify) await verifyControl(entry, resolver ? { resolver } : undefined);

  const url = `${scheme}://${target}/`;
  const pickVector = (name) => {
    const fn = runVector ? runVector[name] || runVector : VECTORS[name];
    if (typeof fn !== 'function') throw new Error(`unknown vector ${JSON.stringify(name)}`);
    return fn;
  };

  // Effective, capped plan (used by both dry-run and execution).
  const cappedSteps = plan.steps.map((s) => ({
    vector: s.vector,
    ...clampToCaps(
      { rps: s.rps, streams: s.streams, durationSec: s.durationSec, concurrency: s.concurrency },
      entry.caps || {},
    ),
  }));

  if (dryRun) {
    return {
      event: 'campaign.dry-run',
      campaign,
      target,
      authorized: true,
      controlVerified: !!verify,
      authorizationRef: entry.authorizationRef ?? null,
      cooldownSec: plan.cooldownSec ?? 0,
      steps: cappedSteps,
      note: 'DRY_RUN — authorization proven, no traffic sent. Set DRY_RUN=0 to execute.',
    };
  }

  const stepVerdicts = [];
  let aborted = false;
  let abortReason = null;

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const fn = pickVector(step.vector);
    const summary = await fn({
      url,
      registry,
      requested: {
        rps: step.rps,
        streams: step.streams,
        durationSec: step.durationSec,
        concurrency: step.concurrency,
      },
      verify: false, // already verified once up front
    });
    const verdict = toExternalVerdict(summary, { authorizationRef: entry.authorizationRef ?? null });
    stepVerdicts.push(verdict);
    if (onStep) onStep({ index: i, step, verdict });

    // Circuit-breaker: don't ramp into a target that is already degrading.
    const health = await healthProbe(url);
    if (!health || health.healthy === false) {
      aborted = true;
      abortReason = `health probe failed after step ${i + 1}: ${health && health.error ? health.error : 'unhealthy'}`;
      break;
    }
    if (i < plan.steps.length - 1 && plan.cooldownSec) await sleep(plan.cooldownSec * 1000);
  }

  const verdict = toCampaignVerdict(
    { campaign, target, stepVerdicts, aborted, abortReason },
    { authorizationRef: entry.authorizationRef ?? null, stepsPlanned: plan.steps.length },
  );
  console.log(JSON.stringify({ event: 'campaign.verdict', verdict }));
  return verdict;
}

export async function dispatchCampaign(env = process.env, deps = {}) {
  const file = env.AUTHORIZED_TARGETS_FILE;
  const target = env.TARGET;
  const campaign = env.CAMPAIGN;
  const dryRun = env.DRY_RUN !== '0';
  if (!file) throw new Error('AUTHORIZED_TARGETS_FILE is required (fail-closed)');
  if (!target) throw new Error('TARGET is required');
  if (!campaign) throw new Error('CAMPAIGN is required');
  const registry = loadRegistry(JSON.parse(fs.readFileSync(file, 'utf8')));
  return runCampaign({
    campaign,
    target,
    registry,
    scheme: env.SCHEME || 'https',
    dryRun,
    verify: true,
    ...deps,
  });
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  dispatchCampaign()
    .then((out) => console.log(JSON.stringify(out)))
    .catch((err) => {
      console.error(JSON.stringify({ event: 'campaign.error', message: err.message }));
      process.exit(1);
    });
}
