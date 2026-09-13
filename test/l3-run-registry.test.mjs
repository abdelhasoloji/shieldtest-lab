import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpoofRunRegistry, MAX_CONCURRENT_SPOOF_CAMPAIGNS } from '../l3/run-registry.mjs';

test('at most one spoofed campaign is active at a time', () => {
  assert.equal(MAX_CONCURRENT_SPOOF_CAMPAIGNS, 1);
  const reg = createSpoofRunRegistry();
  assert.equal(reg.isActive(), false);

  assert.equal(reg.claim('camp-1').ok, true);
  assert.equal(reg.isActive(), true);
  assert.equal(reg.active().campaignId, 'camp-1');

  // A second claim is refused while one is active.
  const second = reg.claim('camp-2');
  assert.equal(second.ok, false);
  assert.match(second.reason, /another spoofed campaign is active/);
});

test('release frees the slot for the next campaign', () => {
  const reg = createSpoofRunRegistry();
  reg.claim('camp-1');
  assert.equal(reg.release('wrong'), false); // only the holder can release
  assert.equal(reg.isActive(), true);
  assert.equal(reg.release('camp-1'), true);
  assert.equal(reg.isActive(), false);
  assert.equal(reg.claim('camp-2').ok, true);
});

test('claim is fail-closed on a missing campaignId', () => {
  const reg = createSpoofRunRegistry();
  assert.throws(() => reg.claim(''), /requires a campaignId/);
  assert.throws(() => reg.claim(), /requires a campaignId/);
});
