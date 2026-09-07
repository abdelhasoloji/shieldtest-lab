import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toVerdict, classifyOutcome, VERDICT_SCHEMA, OUTCOMES } from '../verdict.mjs';
import { runScenario } from '../run-scenario.mjs';

const baseSummary = {
  scenario: 'x',
  perProfile: { dns: { requests: 1 }, ntp: { requests: 1 } },
  reflector: { requests: 100, bap: 40, packetAmplification: 2 },
  target: { packets: 200, avgPps: 50, avgBps: 8000 },
  scrubber: null,
};

test('verdict carries the schema, class C, and the required measurement fields', () => {
  const v = toVerdict(baseSummary);
  assert.equal(v.schema, VERDICT_SCHEMA);
  assert.equal(v.class, 'C'); // network bench — never a class A/B verdict
  assert.equal(v.kind, 'udp-amplification');
  assert.equal(v.labTarget, 'lab-target.internal');
  assert.deepEqual(v.profiles.sort(), ['dns', 'ntp']);
  assert.equal(v.amplificationFactor, 40);
  assert.equal(v.packetAmplification, 2);
  assert.equal(v.target.packets, 200);
  assert.equal(v.mitigation, null);
  assert.ok(OUTCOMES.includes(v.outcome));
  assert.ok(typeof v.generatedAt === 'string' && !Number.isNaN(Date.parse(v.generatedAt)));
});

test('labTarget and runner are overridable', () => {
  const v = toVerdict(baseSummary, { labTarget: 'bench-a.internal', runner: 'ci' });
  assert.equal(v.labTarget, 'bench-a.internal');
  assert.equal(v.runner, 'ci');
});

test('classifyOutcome distinguishes baseline / not-mitigated / mitigated / collateral', () => {
  assert.equal(classifyOutcome({ scrubber: null }), 'UNMITIGATED_BASELINE');
  assert.equal(classifyOutcome({ scrubber: { mitigating: false } }), 'NOT_MITIGATED');
  assert.equal(classifyOutcome({ scrubber: { mitigating: true, collateralPct: 0 } }), 'MITIGATED');
  assert.equal(
    classifyOutcome({ scrubber: { mitigating: true, collateralPct: 40 } }),
    'MITIGATED_WITH_COLLATERAL',
  );
});

test('runScenario attaches a well-formed verdict', async () => {
  const s = await runScenario('amplification-ramp', { generator: { DURATION_SEC: 2 } });
  assert.equal(s.verdict.schema, VERDICT_SCHEMA);
  assert.equal(s.verdict.class, 'C');
  assert.equal(s.verdict.scenario, 'amplification-ramp');
  assert.ok(s.verdict.amplificationFactor >= 1);
});
