// WAH <-> SafeHeight VR contract: runtime gate for every message crossing the bridge.
// Mirrors integration/vr/schemas/*.schema.json; test/vr-contract.test.cjs keeps both in agreement.
// Errors name the field path only, never the received value (it is untrusted learner/device data).
const { randomUUID, createHash } = require('node:crypto');

const PLAN_SCHEMA = 'wah.session_plan';
const LOG_SCHEMA = 'safeheight.vr_event_log';
const MAX_MESSAGE_BYTES = 256 * 1024;
const TOPICS = Object.freeze({ plan: 'wah.session_plan', planAck: 'vr.plan_ack', report: LOG_SCHEMA, reportAck: 'wah.report_ack', lifecycle: 'experience.lifecycle' });
const LEVELS = ['basic', 'intermediate', 'expert'];
const MODES = ['study', 'training'];
const PHASES = ['pre_test', 'post_test'];
const LANGUAGES = ['en'];
const LEVEL_LABELS = { basic: 'Basic', intermediate: 'Intermediate', expert: 'Expert' };
// Reference presets (contract doc, "Como o nivel muda o VR"). The VR owns the scenario; these values are what it reports back.
const PRESETS = Object.freeze({
  basic: Object.freeze({ question_timeout_s: 35, error_pause: true, lightning_before_question: true }),
  intermediate: Object.freeze({ question_timeout_s: 25, error_pause: true, lightning_before_question: false }),
  expert: Object.freeze({ question_timeout_s: 15, error_pause: false, lightning_before_question: false })
});
const OVERRIDE_KEYS = ['preset', 'question_timeout_s', 'error_pause', 'lightning_before_question'];
const LOG = Object.freeze({
  endReasons: ['Results', 'OperatorReset', 'Timeout', 'HeadsetRemoved'],
  levels: Object.values(LEVEL_LABELS),
  sources: ['fixed_in_xr', 'wah_plan'],
  triggers: ['training_menu', 'tablet'],
  declared: ['keep_inspecting', 'stop_and_wait', 'descend_now', 'no_answer'],
  responses: ['stopped_and_waited', 'continued_inspection', 'descended_during_rain', 'photographed_before_pressure', 'not_reached'],
  interventions: ['photo', 'descent'],
  decisions: ['stopped_waited_descended', 'continued_inspection_in_rain', 'descended_during_rain', 'incomplete'],
  classifications: ['safe', 'partially_safe', 'unsafe', 'incomplete'],
  verdicts: ['safe_decisions', 'review_needed', 'critical_risk', 'time_up', 'incomplete'],
  saidVsDid: ['consistent', 'inconsistent']
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
// A stable pseudonym, never an e-mail or a name: letters, digits, - and _ only.
const PSEUDONYM = /^[A-Za-z0-9_-]{4,64}$/;
const SESSION_ID = /^[0-9A-Fa-f]{32}$/;
const CHAPTER = /^[1-9]\.\d{1,2}$/;
// 1.4 builds wrote the pause type with the FName's first casing ("Question"); 1.5 writes lowercase.
const PAUSE_TYPE = /^([Qq]uestion|[Ee]rror_(descent|photo))$/;

function fail(path) { throw new Error(`Invalid VR contract field: ${path}`); }
function check(condition, path) { if (!condition) fail(path); }
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 200) => typeof value === 'string' && value.length > 0 && value.length <= max;
const time = value => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const flag = value => typeof value === 'boolean';
const nullableFlag = value => value === null || flag(value);
const texts = (value, max = 32) => Array.isArray(value) && value.length <= max && value.every(item => text(item));
function minorVersion(value, path) {
  const match = typeof value === 'string' && /^1\.(\d{1,3})$/.exec(value);
  check(match, path);
  return Number(match[1]);
}
function noPrototypeKeys(value, depth = 0) {
  check(depth <= 12, 'nesting');
  if (Array.isArray(value)) value.forEach(item => noPrototypeKeys(item, depth + 1));
  else if (object(value)) for (const [key, item] of Object.entries(value)) {
    check(!['__proto__', 'constructor', 'prototype'].includes(key), 'key');
    noPrototypeKeys(item, depth + 1);
  }
}

function validateSessionPlan(plan) {
  check(object(plan), 'plan');
  check(plan.schema === PLAN_SCHEMA, 'plan.schema');
  minorVersion(plan.schema_version, 'plan.schema_version');
  check(text(plan.plan_id, 36) && UUID.test(plan.plan_id), 'plan.plan_id');
  check(text(plan.created_at_utc, 40) && ISO_UTC.test(plan.created_at_utc), 'plan.created_at_utc');
  check(object(plan.learner), 'plan.learner');
  check(typeof plan.learner.pseudonym === 'string' && PSEUDONYM.test(plan.learner.pseudonym), 'plan.learner.pseudonym');
  check(LANGUAGES.includes(plan.learner.language), 'plan.learner.language');
  check(object(plan.assessment), 'plan.assessment');
  for (const key of ['smartchats_level', 'interview_level', 'quiz_level']) check(LEVELS.includes(plan.assessment[key]), `plan.assessment.${key}`);
  check(integer(plan.assessment.quiz_score_pct, 0, 100), 'plan.assessment.quiz_score_pct');
  const vr = plan.vr;
  check(object(vr), 'plan.vr');
  check(MODES.includes(vr.mode), 'plan.vr.mode');
  check(LEVELS.includes(vr.level), 'plan.vr.level');
  check(vr.training_id === 'weather_hazards', 'plan.vr.training_id');
  check(PHASES.includes(vr.phase), 'plan.vr.phase');
  check(integer(vr.attempt, 1, 20), 'plan.vr.attempt');
  check(Array.isArray(vr.weak_topics) && vr.weak_topics.length <= 64, 'plan.vr.weak_topics');
  vr.weak_topics.forEach((topic, i) => check(object(topic) && integer(topic.module, 1, 8) && typeof topic.chapter === 'string' && CHAPTER.test(topic.chapter) && text(topic.topic), `plan.vr.weak_topics[${i}]`));
  if (plan.overrides !== undefined) {
    const o = plan.overrides;
    check(object(o) && Object.keys(o).every(key => OVERRIDE_KEYS.includes(key)), 'plan.overrides');
    if (o.preset !== undefined) check(LEVELS.includes(o.preset), 'plan.overrides.preset');
    if (o.question_timeout_s !== undefined) check(typeof o.question_timeout_s === 'number' && o.question_timeout_s >= 5 && o.question_timeout_s <= 120, 'plan.overrides.question_timeout_s');
    for (const key of ['error_pause', 'lightning_before_question']) if (o[key] !== undefined) check(flag(o[key]), `plan.overrides.${key}`);
  }
  return plan;
}

function validateScenarioConfig(config, path = 'scenario_config') {
  check(object(config), path);
  check(config.mode === null || MODES.includes(config.mode), `${path}.mode`);
  check(LEVELS.includes(config.preset), `${path}.preset`);
  check(typeof config.question_timeout_s === 'number' && config.question_timeout_s >= 5 && config.question_timeout_s <= 120, `${path}.question_timeout_s`);
  check(flag(config.error_pause), `${path}.error_pause`);
  check(flag(config.lightning_before_question), `${path}.lightning_before_question`);
  check(Array.isArray(config.overrides_applied) && config.overrides_applied.every(key => OVERRIDE_KEYS.includes(key)), `${path}.overrides_applied`);
  return config;
}

// Validates what the WAH reads from a report. Accepts 1.4 (current VR build) and 1.5+ (bridge fields).
function validateEventLog(log) {
  check(object(log), 'report');
  check(log.schema === LOG_SCHEMA, 'report.schema');
  const minor = minorVersion(log.schema_version, 'report.schema_version');
  check(minor >= 4, 'report.schema_version');
  check(typeof log.session_id === 'string' && SESSION_ID.test(log.session_id), 'report.session_id');
  check(text(log.generated_at_utc, 40) && ISO_UTC.test(log.generated_at_utc), 'report.generated_at_utc');
  check(flag(log.completed), 'report.completed');
  check(LOG.endReasons.includes(log.end_reason), 'report.end_reason');
  check(object(log.learner_profile) && LOG.levels.includes(log.learner_profile.level) && LOG.sources.includes(log.learner_profile.source), 'report.learner_profile');
  check(typeof log.duration_s === 'number' && time(log.duration_s), 'report.duration_s');
  check(object(log.start) && LOG.triggers.includes(log.start.trigger) && time(log.start.practice_started_at_s), 'report.start');
  check(Array.isArray(log.steps) && log.steps.length <= 32 && log.steps.every(s => object(s) && text(s.id, 40) && time(s.started_at_s) && time(s.ended_at_s) && flag(s.skipped_by_operator)), 'report.steps');
  check(object(log.ppe) && texts(log.ppe.required) && texts(log.ppe.equipped) && texts(log.ppe.missed) && integer(log.ppe.wrong_item_attempts, 0, 1000) && flag(log.ppe.all_correct), 'report.ppe');
  check(object(log.lifeline) && nullableFlag(log.lifeline.connected_before_ascent), 'report.lifeline');
  check(object(log.inspection) && integer(log.inspection.photo_goal, 0, 100) && integer(log.inspection.photos_sent, 0, 100), 'report.inspection');
  const w = log.weather;
  check(object(w), 'report.weather');
  for (const key of ['rain_started_at_s', 'rain_ended_at_s', 'first_photo_during_rain_at_s', 'declared_at_s']) check(time(w[key]), `report.weather.${key}`);
  for (const key of ['stopped_photos', 'photo_during_rain', 'photo_after_rain']) check(flag(w[key]), `report.weather.${key}`);
  check(w.declared_decision === null || LOG.declared.includes(w.declared_decision), 'report.weather.declared_decision');
  check(nullableFlag(w.answer_feedback), 'report.weather.answer_feedback');
  check(object(log.supervisor_pressure) && LOG.responses.includes(log.supervisor_pressure.response) && flag(log.supervisor_pressure.played) && time(log.supervisor_pressure.at_s), 'report.supervisor_pressure');
  check(object(log.descent) && flag(log.descent.during_rain) && flag(log.descent.premature) && time(log.descent.started_at_s) && time(log.descent.reached_ground_at_s), 'report.descent');
  check(Array.isArray(log.safety_supervisor_interventions) && log.safety_supervisor_interventions.length <= 100 && log.safety_supervisor_interventions.every(i => object(i) && LOG.interventions.includes(i.type) && time(i.at_s)), 'report.safety_supervisor_interventions');
  check(nullableFlag(log.stopped_after_intervention), 'report.stopped_after_intervention');
  check(Array.isArray(log.pedagogical_pauses) && log.pedagogical_pauses.length <= 100 && log.pedagogical_pauses.every(p => object(p) && typeof p.type === 'string' && PAUSE_TYPE.test(p.type) && time(p.at_s) && time(p.duration_s)), 'report.pedagogical_pauses');
  check(object(log.director) && Array.isArray(log.director.incident_keys) && log.director.incident_keys.every(key => text(key, 80)) && integer(log.director.critical_failures, 0, 1000), 'report.director');
  check(LOG.decisions.includes(log.final_decision), 'report.final_decision');
  check(LOG.classifications.includes(log.safety_classification), 'report.safety_classification');
  check(LOG.verdicts.includes(log.verdict), 'report.verdict');
  if (minor >= 5) {
    if (log.plan === null) check(log.learner_profile.source === 'fixed_in_xr', 'report.learner_profile.source');
    else {
      check(object(log.plan) && log.learner_profile.source === 'wah_plan', 'report.plan');
      check(text(log.plan.plan_id, 36) && UUID.test(log.plan.plan_id), 'report.plan.plan_id');
      check(typeof log.plan.pseudonym === 'string' && PSEUDONYM.test(log.plan.pseudonym), 'report.plan.pseudonym');
      check(PHASES.includes(log.plan.phase) && integer(log.plan.attempt, 1, 20), 'report.plan');
    }
    validateScenarioConfig(log.scenario_config, 'report.scenario_config');
    check(w.said_vs_did === null || LOG.saidVsDid.includes(w.said_vs_did), 'report.weather.said_vs_did');
  }
  return log;
}

const ackFields = (payload, path) => { check(object(payload), path); return payload; };
function validatePlanAck(payload) {
  ackFields(payload, 'plan_ack');
  check(text(payload.plan_id, 36) && UUID.test(payload.plan_id), 'plan_ack.plan_id');
  check(flag(payload.accepted), 'plan_ack.accepted');
  if (payload.accepted) validateScenarioConfig(payload.applied_config, 'plan_ack.applied_config');
  else check(payload.applied_config === null && text(payload.error, 500), 'plan_ack.error');
  return payload;
}
function validateReportAck(payload) {
  ackFields(payload, 'report_ack');
  check(payload.session_id === null || (typeof payload.session_id === 'string' && SESSION_ID.test(payload.session_id)), 'report_ack.session_id');
  check(flag(payload.stored), 'report_ack.stored');
  if (!payload.stored) check(text(payload.error, 500), 'report_ack.error');
  return payload;
}
function validateHello(payload) {
  check(object(payload) && text(payload.clientId, 128) && payload.role === 'unreal' && texts(payload.capabilities, 64), 'hello');
  return payload;
}
const PAYLOADS = { [TOPICS.plan]: validateSessionPlan, [TOPICS.planAck]: validatePlanAck, [TOPICS.report]: validateEventLog, [TOPICS.reportAck]: validateReportAck };

// Envelope shared with the VR's QuestSupervisor plugin (version 1). Unknown topics pass with an object payload; callers ignore them.
function validateEnvelope(message) {
  check(object(message), 'message');
  check(message.version === 1, 'message.version');
  check(text(message.id, 64), 'message.id');
  check(['hello', 'publish', 'error'].includes(message.type), 'message.type');
  check(text(message.clientId, 128), 'message.clientId');
  if (message.correlationId !== undefined) check(text(message.correlationId, 64), 'message.correlationId');
  if (message.requiresAck !== undefined) check(flag(message.requiresAck), 'message.requiresAck');
  check(object(message.payload), 'message.payload');
  if (message.type === 'hello') validateHello(message.payload);
  if (message.type === 'publish') {
    check(text(message.topic, 128), 'message.topic');
    if (PAYLOADS[message.topic]) PAYLOADS[message.topic](message.payload);
  }
  return message;
}

function parseMessage(raw) {
  const size = Buffer.isBuffer(raw) ? raw.length : typeof raw === 'string' ? Buffer.byteLength(raw) : -1;
  check(size > 0 && size <= MAX_MESSAGE_BYTES, 'message.size');
  let message;
  try { message = JSON.parse(String(raw)); } catch (_) { fail('message.json'); }
  noPrototypeKeys(message);
  return validateEnvelope(message);
}

function makeEnvelope(type, topic, payload, { clientId = 'wah', correlationId, requiresAck = false } = {}) {
  const message = { version: 1, id: randomUUID(), type, clientId, requiresAck, payload };
  if (topic) message.topic = topic;
  if (correlationId) message.correlationId = correlationId;
  return validateEnvelope(message);
}

// Reference for 1.5 weather.said_vs_did: the tablet answer compared with the behavior after the foreman's call.
function saidVsDid(log) {
  const declared = log?.weather?.declared_decision;
  const response = log?.supervisor_pressure?.response;
  if (!['keep_inspecting', 'stop_and_wait', 'descend_now'].includes(declared) || !response || response === 'not_reached') return null;
  const did = response === 'descended_during_rain' ? 'descend_now'
    : ['continued_inspection', 'photographed_before_pressure'].includes(response) ? 'keep_inspecting' : 'stop_and_wait';
  return declared === did ? 'consistent' : 'inconsistent';
}

// Reference for the preset the VR applies to a plan: study mode pins the validated build; overrides win last.
function scenarioConfigFor(plan) {
  if (!plan) return { mode: null, preset: 'intermediate', ...PRESETS.intermediate, overrides_applied: [] };
  const overrides = plan.overrides || {};
  const preset = overrides.preset || (plan.vr.mode === 'study' ? 'intermediate' : plan.vr.level);
  const config = { mode: plan.vr.mode, preset, ...PRESETS[preset], overrides_applied: Object.keys(overrides).filter(key => OVERRIDE_KEYS.includes(key)) };
  for (const key of ['question_timeout_s', 'error_pause', 'lightning_before_question']) if (overrides[key] !== undefined) config[key] = overrides[key];
  return config;
}

// Stable pseudonym for the study: the e-mail itself never leaves the main process. Not a secret (anyone holding the e-mail can recompute it), only a non-reversible label.
function pseudonymFor(email) {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  check(normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized), 'email');
  return 'L-' + createHash('sha256').update('wah-vr-pseudonym-v1:' + normalized).digest('hex').slice(0, 8);
}

const levelKey = value => LEVELS.find(level => level === String(value || '').toLowerCase()) || null;

// Builds and validates the plan that goes to the headset. `input` comes from the renderer (levels as shown in the UI: "Basic"...); the e-mail becomes a pseudonym here.
function buildSessionPlan({ email, smartChatsLevel, interviewLevel, quizLevel, quizScorePct, weakTopics = [], mode = 'study', phase = 'pre_test', attempt = 1 }, now = new Date()) {
  const topics = (Array.isArray(weakTopics) ? weakTopics : [])
    .filter(t => object(t) && integer(t.module, 1, 8) && typeof t.chapter === 'string' && CHAPTER.test(t.chapter) && text(t.topic))
    .map(t => ({ module: t.module, chapter: t.chapter, topic: t.topic }));
  const unique = [...new Map(topics.map(t => [`${t.module}-${t.chapter}`, t])).values()].slice(0, 64);
  const plan = {
    schema: PLAN_SCHEMA, schema_version: '1.0', plan_id: randomUUID(), created_at_utc: now.toISOString(),
    learner: { pseudonym: pseudonymFor(email), language: 'en' },
    assessment: { smartchats_level: levelKey(smartChatsLevel), interview_level: levelKey(interviewLevel), quiz_level: levelKey(quizLevel), quiz_score_pct: quizScorePct },
    vr: { mode, level: levelKey(quizLevel), training_id: 'weather_hazards', phase, attempt, weak_topics: unique }
  };
  return validateSessionPlan(plan);
}

// Rule table for the VR level when the report is JSON. The first matching row wins; no text parsing, no model.
// Never reads learner_profile.level: in study mode it differs from the preset actually applied.
// `rule` is the row number of the table in the plan doc (1 = rejected by acceptVrReport, so it never appears here).
function vrLevelFor(log) {
  const failures = log.director.critical_failures;
  const said = log.weather.said_vs_did !== undefined ? log.weather.said_vs_did : saidVsDid(log);
  const result = (rule, code, level, reason) => ({ rule, code, level: level && LEVEL_LABELS[level], reason });
  if (log.completed === false || log.end_reason !== 'Results' || log.verdict === 'incomplete') return result(2, 'incomplete', null, 'The VR session did not reach the results screen, so it cannot be rated. Run a new VR session.');
  if (log.safety_classification === 'unsafe' || log.verdict === 'critical_risk' || log.final_decision === 'continued_inspection_in_rain' || failures >= 2) return result(3, 'critical', 'basic', 'Critical decisions in the storm (continued inspecting in the rain or repeated critical failures).');
  if (log.safety_classification === 'partially_safe' || log.descent.during_rain || log.descent.premature || failures >= 1 || said === 'inconsistent'
    || log.stopped_after_intervention === true || log.verdict === 'time_up' || log.scenario_config?.preset === 'basic') return result(4, 'capped', 'intermediate', 'Safe overall, but with a descent in the rain, an inconsistent answer, a safety intervention, time out or the Basic scenario: capped at Intermediate.');
  if (log.safety_classification === 'safe' && log.verdict === 'safe_decisions' && failures === 0 && said !== 'inconsistent' && log.ppe.all_correct && log.lifeline.connected_before_ascent === true) return result(5, 'safe', 'expert', 'Safe decisions with correct PPE and the lifeline connected before the ascent.');
  return result(6, 'default', 'intermediate', 'No critical failure, but not every Expert condition was met.');
}

// Rejects what does not belong to this learner's session. 1.4 reports carry no plan, so they are accepted unbound (`bound: false`); 1.5+ must answer the plan WAH issued.
function acceptVrReport(raw, context = {}) {
  let log;
  try { log = parseVrReport(raw); } catch (error) { return { accepted: false, code: 'invalid', message: error.message }; }
  return judgeVrLog(log, context);
}

// Same checks for a report that is already validated (the WebSocket path parses it with the envelope).
function judgeVrLog(log, { planId = null, seenSessionIds = [] } = {}) {
  const bound = log.plan !== undefined;
  if (bound && (log.plan === null || log.plan.plan_id !== planId)) return { accepted: false, code: 'other_plan', message: 'This report answers a different VR session plan. Save the plan again and run a new VR session.' };
  if (seenSessionIds.some(id => String(id).toLowerCase() === log.session_id.toLowerCase())) return { accepted: false, code: 'duplicate_session', message: 'This VR report was already imported.' };
  return { accepted: true, log, bound, rating: vrLevelFor(log) };
}

function parseVrReport(raw) {
  const size = Buffer.isBuffer(raw) ? raw.length : typeof raw === 'string' ? Buffer.byteLength(raw) : -1;
  check(size > 0 && size <= MAX_MESSAGE_BYTES, 'report.size');
  let log;
  try { log = JSON.parse(String(raw)); } catch (_) { fail('report.json'); }
  noPrototypeKeys(log);
  return validateEventLog(log);
}

// Plain-text digest for the debriefing and the language model: only enum values and numbers of the validated report, never free text from the device.
const SAFE_KEY = /^[A-Za-z0-9_.:-]{1,80}$/;
function reportDigest(log) {
  const yn = value => value === null || value === undefined ? 'not recorded' : value ? 'yes' : 'no';
  const lines = [
    `VR session ${log.completed ? 'completed' : 'not completed'} (end reason: ${log.end_reason}); duration ${Math.round(log.duration_s)} s.`,
    `Safety classification: ${log.safety_classification}. Verdict: ${log.verdict}. Final decision: ${log.final_decision}.`,
    `Critical failures: ${log.director.critical_failures}${log.director.incident_keys.filter(key => SAFE_KEY.test(key)).length ? ` (${log.director.incident_keys.filter(key => SAFE_KEY.test(key)).join(', ')})` : ''}.`,
    `PPE all correct: ${yn(log.ppe.all_correct)}${log.ppe.missed.filter(key => SAFE_KEY.test(key)).length ? `; missed: ${log.ppe.missed.filter(key => SAFE_KEY.test(key)).join(', ')}` : ''}. Lifeline connected before ascent: ${yn(log.lifeline.connected_before_ascent)}.`,
    `Photos sent: ${log.inspection.photos_sent} of ${log.inspection.photo_goal}.`,
    `Declared decision in the storm: ${log.weather.declared_decision || 'none'}. Behavior after the foreman's call: ${log.supervisor_pressure.response}. Said versus did: ${(log.weather.said_vs_did !== undefined ? log.weather.said_vs_did : saidVsDid(log)) || 'not applicable'}.`,
    `Descent during rain: ${yn(log.descent.during_rain)}; premature descent: ${yn(log.descent.premature)}; stopped after safety supervisor intervention: ${yn(log.stopped_after_intervention)}.`
  ];
  if (log.scenario_config) lines.push(`Scenario applied: ${log.scenario_config.preset} preset${log.scenario_config.mode ? `, ${log.scenario_config.mode} mode` : ''}.`);
  return lines.join('\n');
}

// Phase 4: what the learner did in the VR -> chapters of the review quiz (post-test). First matching events first, no repeats.
// Initial map, to be calibrated with the professor. Topics are the chapter titles of data/final-quiz-bank.json.
const REVIEW_TOPICS = Object.freeze({
  '5.3': 'External Influences and Changing Conditions', '5.5': 'Restrictive Conditions', '5.6': 'Weather as a Possible Restrictive Condition',
  '5.7': 'Suspension of Work', '5.9': 'Communication and Supervision', '5.12': 'Worker Guidance Using Only NR-35',
  '6.7': 'Harness and Connection Requirements', '7.6': 'Staying Connected'
});
function reviewChaptersFor(log) {
  const chapters = [];
  const add = (chapter, event) => { if (!chapters.some(c => c.chapter === chapter)) chapters.push({ module: Number(chapter.split('.')[0]), chapter, topic: REVIEW_TOPICS[chapter], event }); };
  if (log.completed === false || log.end_reason !== 'Results' || log.verdict === 'incomplete') return chapters;
  const said = log.weather.said_vs_did !== undefined ? log.weather.said_vs_did : saidVsDid(log);
  if (log.final_decision === 'continued_inspection_in_rain' || ['continued_inspection', 'photographed_before_pressure'].includes(log.supervisor_pressure.response) || log.weather.photo_during_rain) {
    add('5.6', 'worked_in_rain'); add('5.7', 'worked_in_rain');
  }
  if (log.descent.during_rain || log.descent.premature) { add('5.7', 'descent_in_rain'); add('5.5', 'descent_in_rain'); }
  if (said === 'inconsistent') add('5.12', 'said_vs_did_inconsistent');
  if (log.stopped_after_intervention === true || log.safety_supervisor_interventions.length > 0) add('5.9', 'safety_intervention');
  if (log.verdict === 'time_up') add('5.3', 'time_up');
  if (log.director.critical_failures >= 1) add('5.7', 'critical_failure');
  if (!log.ppe.all_correct) add('6.7', 'ppe_incorrect');
  if (log.lifeline.connected_before_ascent === false) add('7.6', 'lifeline_not_connected');
  return chapters;
}

// Phase 4: structured fields of the report for the debriefing (enums, numbers and booleans only, never device text).
function debriefFacts(log) {
  const config = log.scenario_config;
  const said = log.weather.said_vs_did !== undefined ? log.weather.said_vs_did : saidVsDid(log);
  return {
    said_vs_did: said, declared_decision: log.weather.declared_decision, behavior_after_call: log.supervisor_pressure.response,
    final_decision: log.final_decision, safety_classification: log.safety_classification, verdict: log.verdict,
    critical_failures: log.director.critical_failures, descent_during_rain: log.descent.during_rain, premature_descent: log.descent.premature,
    stopped_after_intervention: log.stopped_after_intervention, ppe_all_correct: log.ppe.all_correct,
    lifeline_connected_before_ascent: log.lifeline.connected_before_ascent,
    scenario_config: config ? { mode: config.mode, preset: config.preset, question_timeout_s: config.question_timeout_s, error_pause: config.error_pause, lightning_before_question: config.lightning_before_question } : null
  };
}

// What the renderer receives for an accepted report, by file or by WebSocket: the rule result, the digest and structured fields, never the raw report.
function importedReport({ log, bound, rating }) {
  return { kind: 'json', sessionId: log.session_id.toLowerCase(), bound, planId: log.plan ? log.plan.plan_id : null,
    level: rating.level, rule: rating.rule, code: rating.code, reason: rating.reason, text: reportDigest(log),
    facts: debriefFacts(log), reviewChapters: reviewChaptersFor(log) };
}

module.exports = {
  PLAN_SCHEMA, LOG_SCHEMA, MAX_MESSAGE_BYTES, TOPICS, LEVELS, MODES, PHASES, LEVEL_LABELS, PRESETS,
  validateSessionPlan, validateEventLog, validateScenarioConfig, validatePlanAck, validateReportAck, validateEnvelope,
  parseMessage, makeEnvelope, saidVsDid, scenarioConfigFor,
  pseudonymFor, buildSessionPlan, vrLevelFor, acceptVrReport, judgeVrLog, parseVrReport, reportDigest, importedReport,
  REVIEW_TOPICS, reviewChaptersFor, debriefFacts
};
