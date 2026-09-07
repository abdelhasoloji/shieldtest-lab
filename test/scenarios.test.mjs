import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runScenario } from '../run-scenario.mjs';
import { scenarioNames } from '../scenarios.mjs';

test('every scenario has a name and summary', () => {
  assert.ok(scenarioNames().length >= 4);
});

test('amplification-ramp produces amplified traffic within caps', async () => {
  const s = await runScenario('amplification-ramp', { generator: { DURATION_SEC: 2 } });
  assert.ok(s.reflector.requests > 0, 'reflector saw requests');
  assert.ok(s.reflector.bap >= 1, 'byte amplification observed');
  assert.ok(s.target.packets > 0, 'target received packets');
  assert.equal(s.scrubber, null);
});

test('mitigation-delay-study engages the scrubber and drops excess', async () => {
  const s = await runScenario('mitigation-delay-study', {
    generator: { DURATION_SEC: 2, PPS: 150 },
    scrubber: { DETECTION_DELAY_SEC: 0, THRESHOLD_PPS: 50, CEILING_PPS: 20 },
  });
  assert.ok(s.scrubber, 'scrubber summary present');
  assert.equal(s.scrubber.mitigating, true, 'mitigation should engage');
  assert.ok(s.scrubber.dropped > 0, 'excess should be dropped');
});

test('multi-profile-mix fires several profiles and breaks amplification down per profile', async () => {
  const s = await runScenario('multi-profile-mix', { generator: { DURATION_SEC: 2 } });
  assert.equal(s.generators.length, 3, 'three concurrent generators');
  assert.equal(s.generator.profile, 'mixed');
  const profiles = Object.keys(s.perProfile);
  assert.ok(profiles.includes('dns') && profiles.includes('ntp') && profiles.includes('memcached'));
  for (const p of ['dns', 'ntp', 'memcached']) {
    assert.ok(s.perProfile[p].requests > 0, `${p} saw requests`);
  }
});

test('blocklist-mitigation keeps collateral at zero while dropping attack', async () => {
  const s = await runScenario('blocklist-mitigation', {
    generator: { DURATION_SEC: 2, PPS: 150 },
    scrubber: { DETECTION_DELAY_SEC: 0, THRESHOLD_PPS: 40, CEILING_PPS: 10 },
    legit: { DURATION_SEC: 2, PPS: 40 },
  });
  assert.equal(s.scrubber.strategy, 'blocklist');
  assert.equal(s.scrubber.mitigating, true);
  assert.equal(s.scrubber.collateralPct, 0, 'blocklist forwards all legit');
  assert.ok(s.scrubber.dropped > 0, 'attack traffic dropped');
});

test('a live onSample callback receives chain snapshots during the run', async () => {
  const samples = [];
  await runScenario('amplification-ramp', {
    generator: { DURATION_SEC: 2 },
    onSample: (snap) => samples.push(snap),
  });
  assert.ok(samples.length >= 2, 'sampler fired during the run');
  const last = samples.at(-1);
  assert.ok('reflector' in last && 'target' in last, 'snapshot has the expected shape');
});

test('zeroBS Volumetric UDP vectors are present and runnable', async () => {
  for (const name of ['udp_dns_reflection', 'udp_maxpackets', 'udp_multivector']) {
    assert.ok(scenarioNames().includes(name), `${name} present`);
  }
  const s = await runScenario('udp_multivector', { generator: { DURATION_SEC: 2 } });
  assert.ok(s.reflector.requests > 0, 'multivector produced traffic');
  const profiles = Object.keys(s.perProfile);
  assert.ok(profiles.includes('dns') && profiles.includes('ntp') && profiles.includes('memcached'));
});

test('rejects an unknown scenario', async () => {
  await assert.rejects(() => runScenario('nope'), /unknown scenario/);
});
