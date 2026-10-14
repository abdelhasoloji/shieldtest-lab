import fs from 'node:fs';
import { loadRegistry, assertAuthorizedTarget, verifyControl, clampToCaps } from '../lib/target-guard.mjs';
import { runRapidReset } from './rapid-reset.mjs';
import { toExternalVerdict } from './verdict.mjs';

// Governed dispatch entry for an external authorized resilience test — the piece
// the control panel invokes (via the runner). Fail-closed by construction:
//   - the target must be in the authorized registry file (AUTHORIZED_TARGETS_FILE);
//   - domain control is re-verified live (DNS TXT) before anything fires;
//   - DRY_RUN=1 (the default) authorizes + verifies but sends NO traffic.
// Only when DRY_RUN=0 is explicitly set does it run the bounded test.

export const VECTORS = { 'http2-rapid-reset': runRapidReset };

export async function dispatchExternal(env = process.env, { resolver } = {}) {
  const file = env.AUTHORIZED_TARGETS_FILE;
  const target = env.TARGET;
  const vector = env.PROFILE || 'http2-rapid-reset';
  const dryRun = env.DRY_RUN !== '0'; // default: dry-run (safe)

  if (!file) throw new Error('AUTHORIZED_TARGETS_FILE is required (fail-closed)');
  if (!target) throw new Error('TARGET is required');
  if (!VECTORS[vector]) throw new Error(`unknown vector ${JSON.stringify(vector)}`);

  const registry = loadRegistry(JSON.parse(fs.readFileSync(file, 'utf8')));
  const entry = assertAuthorizedTarget(target, { registry }); // throws unless authorized + in window
  await verifyControl(entry, resolver ? { resolver } : undefined); // throws unless the live DNS-TXT token is present

  const requested = {
    rps: Number(env.RPS || 0),
    streams: Number(env.STREAMS || 0),
    durationSec: Number(env.DURATION_SEC || 0),
    concurrency: Number(env.CONCURRENCY || 0),
  };
  const effective = clampToCaps(requested, entry.caps || {});

  if (dryRun) {
    const plan = {
      event: 'external.dry-run', target, vector, authorized: true, controlVerified: true,
      authorizationRef: entry.authorizationRef ?? null, effective,
      note: 'DRY_RUN — authorization proven, no traffic sent. Set DRY_RUN=0 to execute.',
    };
    console.log(JSON.stringify(plan));
    return plan;
  }

  const scheme = env.SCHEME || 'https';
  const summary = await VECTORS[vector]({
    url: `${scheme}://${target}/`,
    registry,
    requested,
    verify: true,
  });
  const verdict = toExternalVerdict(summary, { authorizationRef: entry.authorizationRef ?? null, runner: env.RUNNER_ID });
  console.log(JSON.stringify({ event: 'external.verdict', verdict }));
  return { summary, verdict };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  dispatchExternal().catch((err) => {
    console.error(JSON.stringify({ event: 'external.error', message: err.message }));
    process.exit(1);
  });
}
