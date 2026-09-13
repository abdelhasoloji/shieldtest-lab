import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKillSwitch } from '../l3/kill-switch.mjs';

/** Deterministic kill switch (no real timer, injected clock via explicit tick t). */
function ks(over = {}) {
  const trips = [];
  const k = createKillSwitch({ useRealTimer: false, now: () => 0, onTrip: (r) => trips.push(r), ...over });
  return { k, trips };
}

test('the absolute timeout trips via tick with an injected clock', () => {
  const { k, trips } = ks({ absoluteTimeoutMs: 1000 });
  k.tick(999);
  assert.equal(k.tripped, false);
  k.tick(1000);
  assert.equal(k.reason, 'absolute-timeout');
  assert.deepEqual(trips, ['absolute-timeout']);
});

test('heartbeat and telemetry watchdogs trip on silence, reset on a beat', () => {
  const a = ks({ heartbeatTimeoutMs: 500 });
  a.k.heartbeat(400);
  a.k.tick(800); // 800-400 = 400 < 500
  assert.equal(a.k.tripped, false);
  a.k.tick(900); // 900-400 = 500 ≥ 500
  assert.equal(a.k.reason, 'heartbeat-lost');

  const b = ks({ telemetryTimeoutMs: 300 });
  b.k.tick(300);
  assert.equal(b.k.reason, 'telemetry-lost');
});

test('synchronous conditions trip: rate, destination, policy escape', () => {
  const rate = ks({ rateCapPps: 100 });
  rate.k.reportRate(104);
  assert.equal(rate.k.tripped, false); // within 5% tolerance
  rate.k.reportRate(120);
  assert.equal(rate.k.reason, 'rate-exceeded');

  const dst = ks({ expectedDestIp: '192.168.100.99' });
  dst.k.reportDestination('192.168.100.99');
  assert.equal(dst.k.tripped, false);
  dst.k.reportDestination('192.168.100.98');
  assert.equal(dst.k.reason, 'destination-changed');

  const esc = ks();
  esc.k.reportPolicyEscape();
  assert.equal(esc.k.reason, 'policy-escape');
});

test('target-unavailable needs a sustained streak; a good reading resets it', () => {
  const { k } = ks({ targetUnavailablePct: 20, targetUnavailableStreak: 3 });
  k.reportTargetAvailability(10);
  k.reportTargetAvailability(50); // resets
  k.reportTargetAvailability(10);
  k.reportTargetAvailability(10);
  assert.equal(k.tripped, false);
  k.reportTargetAvailability(10); // third consecutive
  assert.equal(k.reason, 'target-unavailable');
});

test('operator / parent-died / generator-unresponsive trip immediately', () => {
  assert.equal((() => { const { k } = ks(); k.operatorKill(); return k.reason; })(), 'operator');
  assert.equal((() => { const { k } = ks(); k.parentDied(); return k.reason; })(), 'parent-died');
  assert.equal((() => { const { k } = ks(); k.generatorUnresponsive(); return k.reason; })(), 'generator-unresponsive');
});

test('the first trip latches; later conditions and onTrip do not override it', () => {
  const { k, trips } = ks({ rateCapPps: 100 });
  k.operatorKill();
  k.reportRate(999);
  k.reportPolicyEscape();
  assert.equal(k.reason, 'operator');
  assert.deepEqual(trips, ['operator']); // onTrip fired exactly once
});

test('onTrip can stop the generator AND close the transit policy', () => {
  let generatorStopped = false;
  let policyClosed = false;
  const k = createKillSwitch({
    useRealTimer: false,
    onTrip: () => {
      generatorStopped = true;
      policyClosed = true;
    },
  });
  k.operatorKill();
  assert.equal(generatorStopped, true);
  assert.equal(policyClosed, true);
});

test('the independent real timer fires the absolute timeout even without tick', async () => {
  let reason = null;
  const k = createKillSwitch({ absoluteTimeoutMs: 10, onTrip: (r) => (reason = r) });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(reason, 'absolute-timeout');
  assert.equal(k.tripped, true);
  k.stop();
});
