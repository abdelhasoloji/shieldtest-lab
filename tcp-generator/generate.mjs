import net from 'node:net';
import { assertLabAddressInPrefix } from '../lib/net-guard.mjs';

// Bounded TCP connection-pressure generator for the closed ShieldTest lab.
//
// It reproduces the *state-table exhaustion* shape of a TCP connection flood
// WITHOUT spoofing: it opens real TCP connections from a real lab-CIDR source to
// the lab target and holds them idle, at a capped connections/sec for a capped
// duration. There is no source-IP spoofing and no raw packet crafting — the
// defining trait of a real SYN flood (spoofed sources) is deliberately absent.
//
// `runTcpGenerator()` resolves with the run stats so tests can await a full run.

export function runTcpGenerator(env = process.env) {
  const TARGET_HOST = env.TARGET_HOST || '192.168.100.99';
  const TARGET_PORT = Number(env.TARGET_PORT || 9003);
  const RATE_CPS = Number(env.RATE_CPS || 100); // connections opened per second
  const DURATION_SEC = Number(env.DURATION_SEC || 6);
  const HOLD_MS = Number(env.HOLD_MS || 8000); // how long each connection is held idle
  const MAX_CPS = Number(env.MAX_CPS || 500);
  const MAX_DURATION_SEC = Number(env.MAX_DURATION_SEC || 60);

  // Hard gate: never open toward a public address (RFC1918/loopback only),
  // optionally narrowed by LAB_CIDR_PREFIX. Not env-widenable.
  assertLabAddressInPrefix(TARGET_HOST, env.LAB_CIDR_PREFIX, 'TARGET_HOST');
  if (!Number.isInteger(TARGET_PORT) || TARGET_PORT < 1024 || TARGET_PORT > 65535) {
    throw new Error('TARGET_PORT must be an unprivileged TCP port');
  }
  if (!Number.isFinite(RATE_CPS) || RATE_CPS < 1 || RATE_CPS > MAX_CPS) {
    throw new Error(`RATE_CPS must be 1..${MAX_CPS}`);
  }
  if (!Number.isFinite(DURATION_SEC) || DURATION_SEC < 1 || DURATION_SEC > MAX_DURATION_SEC) {
    throw new Error(`DURATION_SEC must be 1..${MAX_DURATION_SEC}`);
  }

  let opened = 0;
  let failed = 0;
  const sockets = new Set();
  const started = Date.now();
  const TICK_MS = 200;
  const perTick = Math.max(1, Math.round((RATE_CPS * TICK_MS) / 1000));

  return new Promise((resolve) => {
    let timer = null;
    const cleanup = () => {
      for (const s of sockets) s.destroy();
      sockets.clear();
    };
    const finish = () => {
      if (timer) clearInterval(timer);
      cleanup();
      const result = {
        event: 'tcp-generator.complete',
        rateCps: RATE_CPS,
        durationSec: DURATION_SEC,
        opened,
        failed,
      };
      console.log(JSON.stringify(result));
      resolve(result);
    };

    timer = setInterval(() => {
      for (let i = 0; i < perTick; i++) {
        const s = net.connect(TARGET_PORT, TARGET_HOST);
        s.on('connect', () => {
          opened++;
          // Hold the connection idle, then release it.
          setTimeout(() => s.destroy(), HOLD_MS).unref?.();
        });
        s.on('error', () => {
          failed++;
          sockets.delete(s);
        });
        s.on('close', () => sockets.delete(s));
        sockets.add(s);
      }
      if (Date.now() - started >= DURATION_SEC * 1000) finish();
    }, TICK_MS);
  });
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runTcpGenerator();
}
