import { setTimeout as sleep } from 'node:timers/promises';
import { createTarget } from './target/receiver.mjs';
import { createReflector } from './synthetic-reflector/server.mjs';
import { createScrubber } from './scrubber/server.mjs';
import { runGenerator } from './generator/generate.mjs';
import { createTcpTarget } from './tcp-target/receiver.mjs';
import { runTcpGenerator } from './tcp-generator/generate.mjs';
import { SCENARIOS, scenarioNames } from './scenarios.mjs';
import { toVerdict } from './verdict.mjs';

const LOOPBACK = '127.0.0.1';
const PREFIX = '127.0.0.';

function startAsync(c) {
  return new Promise((resolve) => c.start((port) => resolve(port)));
}
function stopAsync(c) {
  return new Promise((resolve) => c.stop(resolve));
}

/**
 * Normalises a scenario's generator config into an array of attack generators.
 * A scenario may declare a single `generator` (the classic form) or a list of
 * `generators` (multi-vector combos: distinct profiles/shapes fired together).
 * `override` shallow-merges into every generator (tests use it to shorten runs).
 */
function attackGenerators(cfg, override = {}) {
  const list = cfg.generators ?? (cfg.generator ? [cfg.generator] : []);
  return list.map((g) => ({ ...g, ...override }));
}

/** Live snapshot of the running chain — shared by the sampler and the summary. */
function snapshot(target, reflector, scrubber) {
  return {
    reflector: {
      requests: reflector.metrics.requests,
      bap: reflector.metrics.bap,
      packetAmplification: reflector.metrics.packetAmplification,
    },
    target: {
      packets: target.metrics.packets,
      avgPps: target.metrics.avgPps,
      avgBps: target.metrics.avgBps,
    },
    scrubber: scrubber
      ? {
          mitigating: scrubber.metrics.mitigating,
          detectionDelaySec: scrubber.metrics.detectionDelaySec,
          received: scrubber.metrics.received,
          forwarded: scrubber.metrics.forwarded,
          dropped: scrubber.metrics.dropped,
          collateralPct: scrubber.metrics.collateralPct,
        }
      : null,
  };
}

/** Per-synthetic-profile breakdown pulled from the reflector's bounded buckets. */
function perProfile(reflector) {
  const out = {};
  for (const [label, b] of reflector.byProfile) {
    out[label] = {
      requests: b.requests,
      inputBytes: b.inputBytes,
      outputPackets: b.outputPackets,
      outputBytes: b.outputBytes,
    };
  }
  return out;
}

/**
 * Runs a TCP connection-pressure scenario in-process over loopback (tcp-target ←
 * tcp-generator). No spoofing, no raw packets — real connections from a real
 * source, capped rate/duration. Returns the same summary shape as the UDP path
 * (with a `tcp` section and `kind:'tcp'`) so the verdict/console/runner reuse it.
 */
async function runTcpScenario(name, cfg, opts = {}) {
  const t = { ...(cfg.target ?? {}), ...opts.target };
  const g = { ...(cfg.generator ?? {}), ...opts.generator };

  const target = createTcpTarget({
    LISTEN_HOST: LOOPBACK,
    LISTEN_PORT: '0',
    CAPACITY: String(t.CAPACITY ?? 200),
  });
  const targetPort = await startAsync(target);

  let sampler = null;
  if (typeof opts.onSample === 'function') {
    const emit = () => {
      try {
        opts.onSample({ kind: 'tcp', target: { ...tcpTargetView(target) } });
      } catch {
        /* a slow consumer must never crash the run */
      }
    };
    emit();
    sampler = setInterval(emit, 250);
    if (typeof sampler.unref === 'function') sampler.unref();
  }

  const gen = await runTcpGenerator({
    TARGET_HOST: LOOPBACK,
    TARGET_PORT: String(targetPort),
    LAB_CIDR_PREFIX: PREFIX,
    RATE_CPS: String(g.RATE_CPS ?? 100),
    DURATION_SEC: String(g.DURATION_SEC ?? 6),
    HOLD_MS: String(g.HOLD_MS ?? 8000),
    MAX_CPS: '2000',
  });
  await sleep(200);
  if (sampler) clearInterval(sampler);

  const summary = {
    scenario: name,
    kind: 'tcp',
    generator: { opened: gen.opened, failed: gen.failed, rateCps: gen.rateCps },
    target: tcpTargetView(target),
  };
  summary.verdict = toVerdict(summary);
  await stopAsync(target);
  return summary;
}

function tcpTargetView(target) {
  return {
    accepted: target.metrics.accepted,
    refused: target.metrics.refused,
    concurrentPeak: target.metrics.concurrentPeak,
    capacity: target.metrics.capacity,
    saturationPct: target.metrics.saturationPct,
  };
}

/**
 * Runs a named scenario in-process over loopback (target → [scrubber] →
 * reflector → generator[s]), returns a summary. `opts.generator`/`opts.scrubber`/
 * `opts.legit` shallow-merge into the scenario config (used by tests to shorten
 * durations). `opts.onSample(snapshot)` — if given — is called ~4×/s with a live
 * view of the chain while the scenario runs (used by the web console).
 */
export async function runScenario(name, opts = {}) {
  const cfg = SCENARIOS[name];
  if (!cfg) throw new Error(`unknown scenario ${name}; try: ${scenarioNames().join(', ')}`);
  if (cfg.kind === 'tcp') return runTcpScenario(name, cfg, opts);
  const gens = attackGenerators(cfg, opts.generator);
  if (gens.length === 0) throw new Error(`scenario ${name} declares no generator`);
  const scr = { ...(cfg.scrubber ?? {}), ...opts.scrubber };

  const target = createTarget({ LISTEN_HOST: LOOPBACK, LISTEN_PORT: '0' });
  const targetPort = await startAsync(target);

  let scrubber = null;
  let scrubberPort = null;
  if (cfg.useScrubber) {
    scrubber = createScrubber({
      LISTEN_HOST: LOOPBACK,
      LISTEN_PORT: '0',
      TARGET_HOST: LOOPBACK,
      TARGET_PORT: String(targetPort),
      LAB_CIDR_PREFIX: PREFIX,
      STRATEGY: scr.STRATEGY ?? 'ceiling',
      THRESHOLD_PPS: String(scr.THRESHOLD_PPS ?? 100),
      CEILING_PPS: String(scr.CEILING_PPS ?? 50),
      DETECTION_DELAY_SEC: String(scr.DETECTION_DELAY_SEC ?? 3),
    });
    scrubberPort = await startAsync(scrubber);
  }

  const reflector = createReflector({
    LISTEN_HOST: LOOPBACK,
    LISTEN_PORT: '0',
    TARGET_HOST: LOOPBACK,
    TARGET_PORT: String(cfg.useScrubber ? scrubberPort : targetPort),
    LAB_CIDR_PREFIX: PREFIX,
  });
  const reflectorPort = await startAsync(reflector);

  const genEnvFor = (g) => ({
    REFLECTOR_HOST: LOOPBACK,
    REFLECTOR_PORT: String(reflectorPort),
    LAB_CIDR_PREFIX: PREFIX,
    PROFILE: g.PROFILE ?? 'generic',
    FACTOR: String(g.FACTOR ?? 10),
    PACKET_FACTOR: String(g.PACKET_FACTOR ?? 1),
    PPS: String(g.PPS ?? 50),
    SHAPE: g.SHAPE ?? 'constant',
    DURATION_SEC: String(g.DURATION_SEC ?? 4),
    MAX_PACKET_FACTOR: '100',
  });

  const legitCfg = cfg.withLegit ? { ...(cfg.legit ?? {}), ...opts.legit } : null;
  const legitEnv =
    legitCfg && scrubber
      ? {
          REFLECTOR_HOST: LOOPBACK,
          REFLECTOR_PORT: String(scrubberPort),
          LAB_CIDR_PREFIX: PREFIX,
          MODE: 'legit',
          PPS: String(legitCfg.PPS ?? 20),
          DURATION_SEC: String(legitCfg.DURATION_SEC ?? gens[0]?.DURATION_SEC ?? 4),
        }
      : null;

  // Live sampler (optional): stream a snapshot of the chain to the console.
  let sampler = null;
  if (typeof opts.onSample === 'function') {
    const emit = () => {
      try {
        opts.onSample(snapshot(target, reflector, scrubber));
      } catch {
        /* a slow/broken consumer must never crash the run */
      }
    };
    emit();
    sampler = setInterval(emit, 250);
    if (typeof sampler.unref === 'function') sampler.unref();
  }

  const attackRuns = await Promise.all([
    ...gens.map((g) => runGenerator(genEnvFor(g))),
    ...(legitEnv ? [runGenerator(legitEnv)] : []),
  ]);
  await sleep(300); // drain in-flight UDP
  if (sampler) clearInterval(sampler);

  const attacks = attackRuns.slice(0, gens.length);
  const totalSent = attacks.reduce((n, r) => n + r.sent, 0);
  const profiles = [...new Set(attacks.map((r) => r.profile))];

  const snap = snapshot(target, reflector, scrubber);
  const summary = {
    scenario: name,
    // Back-compatible aggregate view (single "attack" across all generators).
    generator: { sent: totalSent, profile: profiles.length === 1 ? profiles[0] : 'mixed' },
    // Per-generator detail (multi-vector combos).
    generators: attacks.map((r) => ({
      profile: r.profile,
      shape: r.shape,
      factor: r.factor,
      packetFactor: r.packetFactor,
      sent: r.sent,
    })),
    perProfile: perProfile(reflector),
    reflector: snap.reflector,
    target: snap.target,
    scrubber: snap.scrubber
      ? {
          strategy: scrubber.strategy,
          mitigating: snap.scrubber.mitigating,
          detectionDelaySec: snap.scrubber.detectionDelaySec,
          dropped: snap.scrubber.dropped,
          collateralPct: snap.scrubber.collateralPct,
        }
      : null,
  };
  summary.verdict = toVerdict(summary);

  await stopAsync(reflector);
  if (scrubber) await stopAsync(scrubber);
  await stopAsync(target);
  return summary;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = process.argv.slice(2);
  const verdictOnly = args.includes('--verdict');
  const name = args.find((a) => !a.startsWith('--'));
  if (!name || !SCENARIOS[name]) {
    console.error(`Usage: node run-scenario.mjs <scenario> [--verdict]\nScenarios:`);
    for (const n of scenarioNames()) console.error(`  ${n} — ${SCENARIOS[n].summary}`);
    process.exit(1);
  }
  runScenario(name)
    .then((s) => console.log(JSON.stringify(verdictOnly ? s.verdict : s, null, 2)))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
