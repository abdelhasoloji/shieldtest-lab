// Independent kill-switch supervisor for a spoofed L3 run.
//
// It sits OUTSIDE the generator's own control flow and can trip on many
// conditions. On the FIRST trip it latches a reason and invokes `onTrip(reason)`,
// which the caller wires to BOTH stopping the generator AND closing the egress
// transit policy. Crucially it arms an ABSOLUTE timeout on a real, independent
// timer (unref'd) so a run can never outlive its bound even if every
// generator-side timer fails. All time-based checks are also reachable through
// `tick(now)` with an injected clock, so the supervisor is fully deterministic
// under `node --test` — no root, no capability, no real delays required.

const RATE_TOLERANCE = 1.05;

export function createKillSwitch(opts = {}) {
  const {
    absoluteTimeoutMs = 0,
    heartbeatTimeoutMs = 0,
    telemetryTimeoutMs = 0,
    rateCapPps = 0,
    expectedDestIp = null,
    targetUnavailablePct = 20,
    targetUnavailableStreak = 3,
    onTrip,
    now = () => Date.now(),
    useRealTimer = true,
  } = opts;

  const start = now();
  let lastHeartbeat = start;
  let lastTelemetry = start;
  let tripped = false;
  let reason = null;
  let targetLowStreak = 0;
  let realTimer = null;

  const trip = (r) => {
    if (tripped) return reason;
    tripped = true;
    reason = r;
    if (realTimer) {
      clearTimeout(realTimer);
      realTimer = null;
    }
    try {
      onTrip?.(r);
    } catch {
      /* a faulty onTrip must not prevent the latch */
    }
    return r;
  };

  // Independent absolute-timeout backstop (never relies on tick being called).
  if (useRealTimer && absoluteTimeoutMs > 0) {
    realTimer = setTimeout(() => trip('absolute-timeout'), absoluteTimeoutMs);
    realTimer.unref?.();
  }

  return {
    get tripped() {
      return tripped;
    },
    get reason() {
      return reason;
    },
    /** Time-based evaluation with an injected clock (absolute / heartbeat / telemetry). */
    tick(t = now()) {
      if (tripped) return;
      if (absoluteTimeoutMs > 0 && t - start >= absoluteTimeoutMs) return void trip('absolute-timeout');
      if (heartbeatTimeoutMs > 0 && t - lastHeartbeat >= heartbeatTimeoutMs) return void trip('heartbeat-lost');
      if (telemetryTimeoutMs > 0 && t - lastTelemetry >= telemetryTimeoutMs) return void trip('telemetry-lost');
    },
    heartbeat(t = now()) {
      if (!tripped) lastHeartbeat = t;
    },
    telemetry(t = now()) {
      if (!tripped) lastTelemetry = t;
    },
    reportRate(pps) {
      if (!tripped && rateCapPps > 0 && pps > rateCapPps * RATE_TOLERANCE) trip('rate-exceeded');
    },
    reportDestination(ip) {
      if (!tripped && expectedDestIp && ip !== expectedDestIp) trip('destination-changed');
    },
    reportPolicyEscape() {
      trip('policy-escape');
    },
    reportTargetAvailability(pct) {
      if (tripped) return;
      if (pct < targetUnavailablePct) {
        if ((targetLowStreak += 1) >= targetUnavailableStreak) trip('target-unavailable');
      } else {
        targetLowStreak = 0;
      }
    },
    generatorUnresponsive() {
      trip('generator-unresponsive');
    },
    parentDied() {
      trip('parent-died');
    },
    operatorKill() {
      trip('operator');
    },
    /** Release the independent timer (cleanup). */
    stop() {
      if (realTimer) {
        clearTimeout(realTimer);
        realTimer = null;
      }
    },
  };
}
