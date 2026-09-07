// Governed bench runner — the isolated executor for ShieldTest's class-C dispatch.
//
// This is the ONLY side that emits synthetic amplification traffic. It runs
// OUTSIDE the ShieldTest control plane: the control plane records a CISO-authorized
// run request and serves it here; this runner claims it, executes the named
// scenario in-process over loopback (the lab), and posts a read-only class-C
// verdict back. The control plane never opens an amplification socket.
//
// It only ever receives an allowlisted SCENARIO NAME and a lab-target label from
// the governed queue — never an arbitrary host, rate or duration. Every scenario
// is bounded by the lab's hard caps.

import { runScenario as defaultRunScenario } from './run-scenario.mjs';

const authHeaders = (token) => ({
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
});

/** Claim the next REQUESTED run from the control plane (or null if the queue is empty). */
export async function claimNext({ apiUrl, token, runnerId, fetchImpl = fetch }) {
  const res = await fetchImpl(`${apiUrl}/api/bench/runs/next/claim`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ runner: runnerId }),
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`claim failed: HTTP ${res.status}`);
  return res.json();
}

/** Post a result (verdict or error) for a claimed run. */
export async function postResult({ apiUrl, token, id, body, fetchImpl = fetch }) {
  const res = await fetchImpl(`${apiUrl}/api/bench/runs/${id}/result`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`result post failed: HTTP ${res.status}`);
  return res.json();
}

/**
 * Claim one run, execute it in the lab (outside the control plane), and post the
 * verdict back. Returns a small result descriptor, or null when the queue was
 * empty. `runScenario` is injectable for tests.
 */
export async function processOne({
  apiUrl,
  token,
  runnerId,
  fetchImpl = fetch,
  runScenario = defaultRunScenario,
}) {
  const run = await claimNext({ apiUrl, token, runnerId, fetchImpl });
  if (!run) return null;
  try {
    const summary = await runScenario(run.scenario);
    // The verdict pertains to the governed lab target, tagged with this runner.
    const verdict = { ...summary.verdict, labTarget: run.labTarget, runner: runnerId };
    await postResult({ apiUrl, token, id: run.id, body: { verdict }, fetchImpl });
    return { id: run.id, scenario: run.scenario, outcome: verdict.outcome };
  } catch (err) {
    await postResult({ apiUrl, token, id: run.id, body: { error: err.message }, fetchImpl });
    return { id: run.id, scenario: run.scenario, error: err.message };
  }
}

export function configFromEnv(env = process.env) {
  const apiUrl = (env.BENCH_API_URL || '').replace(/\/+$/, '');
  const token = env.BENCH_RUNNER_TOKEN || '';
  const runnerId = env.RUNNER_ID || `lab-runner-${process.pid}`;
  const pollMs = Math.max(1000, Number(env.POLL_INTERVAL_MS || 5000));
  const once = env.RUNNER_ONCE === '1';
  // Fail-closed: without an endpoint and token the runner does nothing.
  if (!apiUrl || !token) {
    throw new Error('BENCH_API_URL and BENCH_RUNNER_TOKEN are required');
  }
  return { apiUrl, token, runnerId, pollMs, once };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const cfg = configFromEnv();
  console.log(
    JSON.stringify({ event: 'runner.start', apiUrl: cfg.apiUrl, runnerId: cfg.runnerId, once: cfg.once }),
  );
  let stop = false;
  const onSignal = () => {
    stop = true;
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);

  do {
    let result = null;
    try {
      result = await processOne(cfg);
    } catch (err) {
      console.error(JSON.stringify({ event: 'runner.error', message: err.message }));
      await sleep(cfg.pollMs);
      continue;
    }
    if (result) {
      console.log(JSON.stringify({ event: 'runner.handled', ...result }));
    } else if (!cfg.once) {
      await sleep(cfg.pollMs);
    }
  } while (!cfg.once && !stop);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
