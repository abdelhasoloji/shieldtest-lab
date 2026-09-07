import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScrubber } from '../scrubber/server.mjs';

const ATTACK = Buffer.from('{}'); // opaque → treated as attack-shaped
const LEGIT = Buffer.from(JSON.stringify({ type: 'shieldtest.legit' }));
const base = { TARGET_HOST: '127.0.0.1', LAB_CIDR_PREFIX: '127.0.0.' };

/** Drives one over-threshold window then a tick, so mitigation is engaged. */
function engage(s, { attack = 0, legit = 0 } = {}) {
  for (let i = 0; i < attack; i++) s.ingest(ATTACK);
  for (let i = 0; i < legit; i++) s.ingest(LEGIT);
  s.tick();
}

test('unknown strategy is rejected', () => {
  assert.throws(
    () => createScrubber({ ...base, STRATEGY: 'nope' }),
    /STRATEGY must be one of/,
  );
});

test('ceiling strategy (default) caps forwarding and can drop legit as collateral', () => {
  const s = createScrubber({ ...base, THRESHOLD_PPS: '5', CEILING_PPS: '2', DETECTION_DELAY_SEC: '0' });
  assert.equal(s.strategy, 'ceiling');
  engage(s, { attack: 10 }); // breach → mitigating next window
  // Now mitigating: a window of 2 legit + 8 attack, ceiling 2 → 2 forwarded, 8 dropped.
  for (let i = 0; i < 2; i++) s.ingest(LEGIT);
  for (let i = 0; i < 8; i++) s.ingest(ATTACK);
  assert.equal(s.metrics.mitigating, true);
  assert.ok(s.metrics.dropped >= 8, 'excess dropped under the blunt ceiling');
  assert.ok(s.metrics.droppedLegit >= 0);
});

test('blocklist strategy forwards all legit and drops attack (near-zero collateral)', () => {
  const s = createScrubber({
    ...base,
    STRATEGY: 'blocklist',
    THRESHOLD_PPS: '5',
    CEILING_PPS: '2',
    DETECTION_DELAY_SEC: '0',
  });
  engage(s, { attack: 10 });
  const legitBefore = s.metrics.forwarded;
  // Mitigating window: 20 legit + 20 attack.
  for (let i = 0; i < 20; i++) s.ingest(LEGIT);
  for (let i = 0; i < 20; i++) s.ingest(ATTACK);
  assert.equal(s.metrics.mitigating, true);
  assert.ok(s.metrics.forwarded - legitBefore >= 20, 'all legit forwarded');
  assert.equal(s.metrics.droppedLegit, 0, 'blocklist never drops legit');
  assert.equal(s.metrics.collateralPct, 0);
  assert.ok(s.metrics.dropped >= 20, 'attack-classified traffic dropped');
});

test('adaptive strategy raises the effective ceiling when it harms legit traffic', () => {
  const s = createScrubber({
    ...base,
    STRATEGY: 'adaptive',
    THRESHOLD_PPS: '100',
    CEILING_PPS: '10',
    DETECTION_DELAY_SEC: '0',
  });
  engage(s, { attack: 200 }); // breach → mitigating
  const start = s.metrics.effectiveCeiling;
  assert.equal(start, 10);
  // A window that forwards the ceiling then drops legit → collateral this window.
  for (let i = 0; i < 10; i++) s.ingest(ATTACK); // fill the ceiling with attack
  for (let i = 0; i < 20; i++) s.ingest(LEGIT); // these are dropped (collateral)
  assert.ok(s.metrics.droppedLegit > 0, 'collateral occurred');
  s.tick();
  assert.ok(s.metrics.effectiveCeiling > start, 'ceiling loosened after collateral');
  assert.ok(s.metrics.effectiveCeiling <= 100, 'never exceeds threshold');
});

test('adaptive strategy decays the ceiling back down when there is no collateral', () => {
  const s = createScrubber({
    ...base,
    STRATEGY: 'adaptive',
    THRESHOLD_PPS: '100',
    CEILING_PPS: '10',
    DETECTION_DELAY_SEC: '0',
  });
  engage(s, { attack: 200 });
  // Force the ceiling up first (collateral window), then quiet legit windows.
  for (let i = 0; i < 10; i++) s.ingest(ATTACK);
  for (let i = 0; i < 20; i++) s.ingest(LEGIT);
  s.tick();
  const raised = s.metrics.effectiveCeiling;
  assert.ok(raised > 10);
  // A window with only attack (no legit dropped) → decay.
  for (let i = 0; i < 5; i++) s.ingest(ATTACK);
  s.tick();
  assert.ok(s.metrics.effectiveCeiling < raised, 'ceiling decayed without collateral');
  assert.ok(s.metrics.effectiveCeiling >= 10, 'never below the floor');
});
