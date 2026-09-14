import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, spoofPanelModel, renderSpoofPanelHtml } from '../console/spoof-panel.mjs';

test('esc neutralises every markup character', () => {
  assert.equal(esc('<script>alert("x")&\'</script>'), '&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;&lt;/script&gt;');
  assert.equal(esc(undefined), '');
  assert.equal(esc(42), '42');
});

test('the model normalises locks, countdown and counters', () => {
  const m = spoofPanelModel({
    active: true,
    locks: { config: true, confinement: 'GO', egress: true },
    countdownSec: 12.9,
    droppedPackets: 5,
  });
  assert.equal(m.active, true);
  assert.deepEqual(m.locks, { config: true, confinement: 'GO', egress: true });
  assert.equal(m.countdownSec, 12);
  assert.equal(m.droppedPackets, 5);
  // Unknown confinement state degrades to PENDING (not GO).
  assert.equal(spoofPanelModel({ locks: { confinement: 'maybe' } }).locks.confinement, 'PENDING');
});

test('rendered HTML escapes dynamic values and never injects markup', () => {
  const html = renderSpoofPanelHtml({
    active: true,
    locks: { config: true, confinement: 'NO_GO', egress: false },
    sourcePool: '<script>evil</script>',
    target: { id: 'synthetic-target-a', ip: '192.168.100.99' },
    limits: { requested: { pps: 100 }, absolute: { pps: 200 } },
    countdownSec: 8,
    droppedPackets: 3,
    lastStopReason: 'operator',
  });
  assert.match(html, /SPOOFED LAB MODE — ACTIVE/);
  assert.ok(!html.includes('<script>evil</script>'), 'raw markup must not appear');
  assert.match(html, /&lt;script&gt;evil&lt;\/script&gt;/);
  assert.match(html, /Lock 2 — confinement: NO_GO/);
  assert.match(html, /data-action="kill-spoof"/); // permanent kill button
  assert.match(html, /192\.168\.100\.99/);
  // The panel offers no free-text IP/CIDR/interface input.
  assert.ok(!/<input/i.test(html));
});
