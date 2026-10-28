const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const Ajv2020 = require('ajv/dist/2020');
const { root } = require('./helpers.cjs');
const contract = require('../src/vr-contract.cjs');
const { startMockWah } = require('../integration/vr/mock-wah.cjs');
const { runMockVr } = require('../integration/vr/mock-vr.cjs');

const dir = path.join(root, 'integration/vr');
const read = file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
const examples = prefix => fs.readdirSync(path.join(dir, 'examples')).filter(name => name.startsWith(prefix)).map(name => [name, read(`examples/${name}`)]);
const ajv = new Ajv2020({ allErrors: true, strict: false });
for (const name of ['session-plan', 'vr-event-log', 'envelope']) ajv.addSchema(read(`schemas/${name}.schema.json`));
const schema = name => ajv.getSchema(`https://github.com/agsiqueira/work-at-heights/integration/vr/schemas/${name}.schema.json`);
const trainingPlan = () => read('examples/session-plan.training-basic.json');
const report15 = () => read('examples/vr-event-log.1.5.training-basic.safe.json');

test('every example passes its JSON Schema and the runtime validator', () => {
  const plans = examples('session-plan.'), reports = examples('vr-event-log.');
  assert.ok(plans.length >= 2 && reports.length >= 4);
  for (const [name, plan] of plans) {
    assert.ok(schema('session-plan')(plan), `${name}: ${ajv.errorsText(schema('session-plan').errors)}`);
    assert.doesNotThrow(() => contract.validateSessionPlan(plan), name);
    assert.ok(schema('envelope')(contract.makeEnvelope('publish', contract.TOPICS.plan, plan)), name);
  }
  for (const [name, report] of reports) {
    assert.ok(schema('vr-event-log')(report), `${name}: ${ajv.errorsText(schema('vr-event-log').errors)}`);
    assert.doesNotThrow(() => contract.validateEventLog(report), name);
    assert.ok(schema('envelope')(contract.makeEnvelope('publish', contract.TOPICS.report, report, { clientId: 'quest' })), name);
  }
});

test('schema and runtime validator reject the same broken plans', () => {
  const cases = {
    'other schema': p => { p.schema = 'wah.other'; },
    'major version 2': p => { p.schema_version = '2.0'; },
    'unknown level': p => { p.vr.level = 'advanced'; },
    'e-mail as pseudonym': p => { p.learner.pseudonym = 'ana@example.com'; },
    'missing mode': p => { delete p.vr.mode; },
    'unknown override': p => { p.overrides = { colour: 'red' }; },
    'override out of range': p => { p.overrides = { question_timeout_s: 1 }; },
    'malformed chapter': p => { p.vr.weak_topics[0].chapter = 'five'; },
    'plan id not a UUID': p => { p.plan_id = 'abc'; }
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const plan = trainingPlan();
    mutate(plan);
    assert.equal(schema('session-plan')(plan), false, `schema accepted: ${name}`);
    assert.throws(() => contract.validateSessionPlan(plan), /Invalid VR contract field/, `validator accepted: ${name}`);
  }
  const extra = trainingPlan();
  extra.future_field = { anything: true };
  assert.ok(schema('session-plan')(extra));
  assert.doesNotThrow(() => contract.validateSessionPlan(extra));
});

test('schema and runtime validator reject the same broken reports', () => {
  const cases = {
    'version before 1.4': r => { r.schema_version = '1.3'; },
    'unknown verdict': r => { r.verdict = 'great'; },
    '1.5 without scenario_config': r => { delete r.scenario_config; },
    '1.5 without said_vs_did': r => { delete r.weather.said_vs_did; },
    'no plan but source wah_plan': r => { r.plan = null; },
    'plan but source fixed_in_xr': r => { r.learner_profile.source = 'fixed_in_xr'; },
    'unknown pause type': r => { r.pedagogical_pauses[0].type = 'Pause'; },
    'unknown declared decision': r => { r.weather.declared_decision = 'run'; },
    'session id not hex': r => { r.session_id = 'not-hex'; },
    'negative time': r => { r.descent.started_at_s = -1; }
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const report = report15();
    mutate(report);
    assert.equal(schema('vr-event-log')(report), false, `schema accepted: ${name}`);
    assert.throws(() => contract.validateEventLog(report), /Invalid VR contract field/, `validator accepted: ${name}`);
  }
  const withoutPlan = report15();
  Object.assign(withoutPlan, { plan: null, scenario_config: contract.scenarioConfigFor(null) });
  withoutPlan.learner_profile.source = 'fixed_in_xr';
  assert.ok(schema('vr-event-log')(withoutPlan));
  assert.doesNotThrow(() => contract.validateEventLog(withoutPlan));
});

test('saidVsDid compares the tablet answer with the behavior after the foreman call', () => {
  assert.equal(contract.saidVsDid(read('examples/vr-event-log.1.4.safe.quest.json')), 'consistent');
  assert.equal(contract.saidVsDid(read('examples/vr-event-log.1.5.study.partially-safe.json')), 'inconsistent');
  assert.equal(contract.saidVsDid(read('examples/vr-event-log.1.4.partial-headset-removed.json')), null);
  const said = (declared_decision, response) => contract.saidVsDid({ weather: { declared_decision }, supervisor_pressure: { response } });
  assert.equal(said('keep_inspecting', 'continued_inspection'), 'consistent');
  assert.equal(said('descend_now', 'descended_during_rain'), 'consistent');
  assert.equal(said('stop_and_wait', 'continued_inspection'), 'inconsistent');
  assert.equal(said('no_answer', 'stopped_and_waited'), null);
  assert.equal(said('stop_and_wait', 'not_reached'), null);
});

test('scenarioConfigFor pins study mode to the validated preset and applies overrides last', () => {
  assert.deepEqual(contract.scenarioConfigFor(read('examples/session-plan.study.json')),
    { mode: 'study', preset: 'intermediate', question_timeout_s: 25, error_pause: true, lightning_before_question: false, overrides_applied: [] });
  assert.deepEqual(contract.scenarioConfigFor(trainingPlan()),
    { mode: 'training', preset: 'basic', question_timeout_s: 35, error_pause: true, lightning_before_question: true, overrides_applied: [] });
  const plan = trainingPlan();
  plan.overrides = { question_timeout_s: 20, error_pause: false };
  assert.deepEqual(contract.scenarioConfigFor(plan),
    { mode: 'training', preset: 'basic', question_timeout_s: 20, error_pause: false, lightning_before_question: true, overrides_applied: ['question_timeout_s', 'error_pause'] });
  assert.equal(contract.scenarioConfigFor(null).mode, null);
});

test('parseMessage bounds size, refuses prototype keys and never echoes received values', () => {
  assert.throws(() => contract.parseMessage('x'.repeat(contract.MAX_MESSAGE_BYTES + 1)), /message\.size/);
  assert.throws(() => contract.parseMessage('{not json'), /message\.json/);
  assert.throws(() => contract.parseMessage('{"version":1,"id":"a","type":"hello","clientId":"q","payload":{"__proto__":{"polluted":true}}}'), /key/);
  assert.equal({}.polluted, undefined);
  const plan = trainingPlan();
  plan.learner.pseudonym = 'ana@example.com';
  const raw = JSON.stringify({ version: 1, id: 'm1', type: 'publish', topic: contract.TOPICS.plan, clientId: 'wah', payload: plan });
  assert.throws(() => contract.parseMessage(raw), error => !error.message.includes('ana@example.com') && /plan\.learner\.pseudonym/.test(error.message));
});

test('mock WAH and mock VR complete the plan -> report cycle', async () => {
  const wah = startMockWah({ port: 0 });
  const acks = [];
  wah.events.on('plan_ack', ack => acks.push(ack));
  try {
    const port = await wah.ready;
    const result = await runMockVr({ url: `ws://127.0.0.1:${port}/ws` });
    assert.equal(result.ack.stored, true);
    assert.equal(acks.length, 1);
    assert.equal(acks[0].accepted, true);
    assert.equal(result.report.plan.plan_id, trainingPlan().plan_id);
    assert.equal(result.report.scenario_config.preset, 'basic');
    assert.equal(result.report.learner_profile.source, 'wah_plan');
    assert.ok(schema('vr-event-log')(result.report));
    assert.deepEqual([...wah.reports.keys()], [result.report.session_id]);
  } finally { await wah.close(); }
});

test('a lost ack makes the VR resend after reconnecting and WAH keeps the report once', async () => {
  const wah = startMockWah({ port: 0, dropFirstAck: true });
  const seen = [];
  wah.events.on('report', event => seen.push(event.duplicate));
  try {
    const port = await wah.ready;
    const result = await runMockVr({ url: `ws://127.0.0.1:${port}/ws` });
    assert.equal(result.ack.stored, true);
    assert.ok(result.reconnects >= 1);
    assert.deepEqual(seen, [false, true]);
    assert.equal(wah.reports.size, 1);
  } finally { await wah.close(); }
});

test('an invalid plan is answered as rejected and the VR runs its default scenario', async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0, path: '/ws' });
  await new Promise(resolve => server.once('listening', resolve));
  const plan = trainingPlan();
  plan.vr.level = 'advanced';
  const seen = {};
  server.on('connection', socket => socket.on('message', raw => {
    const message = JSON.parse(String(raw));
    if (message.type === 'hello') socket.send(JSON.stringify({ version: 1, id: 'plan-msg-1', type: 'publish', topic: contract.TOPICS.plan, clientId: 'wah', requiresAck: true, payload: plan }));
    if (message.topic === contract.TOPICS.planAck) seen.ack = { ...contract.validatePlanAck(message.payload), correlationId: message.correlationId };
    if (message.topic === contract.TOPICS.report) socket.send(JSON.stringify(contract.makeEnvelope('publish', contract.TOPICS.reportAck, { session_id: message.payload.session_id, stored: true }, { correlationId: message.id })));
  }));
  try {
    const result = await runMockVr({ url: `ws://127.0.0.1:${server.address().port}/ws` });
    assert.equal(seen.ack.accepted, false);
    assert.equal(seen.ack.correlationId, 'plan-msg-1');
    assert.match(seen.ack.error, /plan\.vr\.level/);
    assert.equal(result.report.plan, null);
    assert.equal(result.report.learner_profile.source, 'fixed_in_xr');
    assert.equal(result.report.scenario_config.mode, null);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
