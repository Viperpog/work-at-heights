#!/usr/bin/env node
// Simulated SafeHeight VR, so WAH can be developed without a headset. It behaves as the bridge build will:
// hello -> receive wah.session_plan -> vr.plan_ack -> send the 1.5 report -> wait for wah.report_ack,
// resending the report after a reconnect until it is acknowledged.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const WebSocket = require('ws');
const contract = require('../../src/vr-contract.cjs');

const DEFAULT_REPORT = path.join(__dirname, 'examples', 'vr-event-log.1.4.safe.quest.json');
const CAPABILITIES = ['wah.session_plan@1', 'safeheight.vr_event_log@1.5'];
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

// What the VR report writer adds in 1.5 on top of a 1.4 report.
function upgradeReport(base, plan, config = contract.scenarioConfigFor(plan), { sessionId, generatedAt } = {}) {
  const report = structuredClone(base);
  report.schema_version = '1.5';
  if (sessionId) report.session_id = sessionId;
  if (generatedAt) report.generated_at_utc = generatedAt;
  report.learner_profile = { ...report.learner_profile, level: plan ? contract.LEVEL_LABELS[plan.vr.level] : 'Intermediate', source: plan ? 'wah_plan' : 'fixed_in_xr' };
  report.pedagogical_pauses = report.pedagogical_pauses.map(pause => ({ ...pause, type: pause.type.toLowerCase() }));
  report.weather = { ...report.weather, said_vs_did: contract.saidVsDid(report) };
  report.plan = plan ? { plan_id: plan.plan_id, pseudonym: plan.learner.pseudonym, phase: plan.vr.phase, attempt: plan.vr.attempt } : null;
  report.scenario_config = config;
  return contract.validateEventLog(report);
}

function looseEnvelope(raw) {
  try {
    const message = JSON.parse(String(raw));
    return message && typeof message === 'object' ? message : null;
  } catch (_) { return null; }
}

function runMockVr({ url = 'ws://127.0.0.1:8787/ws', baseReport = readJson(DEFAULT_REPORT), clientId = 'mock-vr', timeoutMs = 15000, maxReconnects = 5, log = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    let socket, plan = null, planAck = null, reportMessage = null, reconnects = 0, done = false;
    const timer = setTimeout(() => finish(new Error('Mock VR timed out waiting for WAH.')), timeoutMs);
    function finish(error, result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket?.close();
      if (error) reject(error); else resolve(result);
    }
    const send = message => socket.send(JSON.stringify(message));
    const envelope = (type, topic, payload, options = {}) => contract.makeEnvelope(type, topic, payload, { clientId, ...options });

    function runSession() {
      const report = upgradeReport(baseReport, plan, planAck.accepted ? planAck.applied_config : contract.scenarioConfigFor(null), {
        sessionId: randomBytes(16).toString('hex').toUpperCase(), generatedAt: new Date().toISOString()
      });
      reportMessage = envelope('publish', contract.TOPICS.report, report, { requiresAck: true });
      send(reportMessage);
      log(`report sent session=${report.session_id} verdict=${report.verdict}`);
    }

    function onPlan(message) {
      if (reportMessage) return log('plan ignored: the session already ran');
      try {
        plan = contract.validateSessionPlan(message.payload);
        planAck = { plan_id: plan.plan_id, accepted: true, applied_config: contract.scenarioConfigFor(plan) };
      } catch (error) {
        plan = null;
        planAck = { plan_id: message.payload?.plan_id, accepted: false, applied_config: null, error: error.message };
      }
      try { send(envelope('publish', contract.TOPICS.planAck, planAck, { correlationId: message.id })); }
      catch (_) { log('plan without a usable plan_id: running without a plan'); }
      log(`plan ${planAck.accepted ? 'accepted' : 'rejected'}${plan ? ` preset=${planAck.applied_config.preset}` : ''}`);
      runSession();
    }

    function connect() {
      socket = new WebSocket(url, { maxPayload: contract.MAX_MESSAGE_BYTES });
      socket.on('open', () => {
        send(envelope('hello', null, { clientId, role: 'unreal', capabilities: CAPABILITIES, deviceLabel: 'Mock VR', appId: 'mock.safeheight.vr', appVersion: 'mock', headsetModel: 'none', sessionId: '' }));
        if (reportMessage) { log('resending the unacknowledged report'); send(reportMessage); }
      });
      socket.on('message', raw => {
        let message;
        try { message = contract.parseMessage(raw); }
        catch (_) {
          // An invalid plan is still answered (accepted: false); the VR then runs its default scenario.
          const loose = looseEnvelope(raw);
          if (loose?.type === 'publish' && loose.topic === contract.TOPICS.plan && typeof loose.id === 'string') onPlan(loose);
          else log('invalid message ignored');
          return;
        }
        if (message.type !== 'publish') return;
        if (message.topic === contract.TOPICS.plan) onPlan(message);
        else if (message.topic === contract.TOPICS.reportAck && reportMessage && message.correlationId === reportMessage.id) {
          finish(null, { plan, planAck, report: reportMessage.payload, ack: message.payload, reconnects });
        }
      });
      socket.on('error', error => log(`connection error: ${error.code || error.message}`));
      socket.on('close', () => {
        if (done) return;
        if (++reconnects > maxReconnects) return finish(new Error('Mock VR could not reach WAH.'));
        setTimeout(connect, 300);
      });
    }
    connect();
  });
}

module.exports = { runMockVr, upgradeReport, CAPABILITIES };

if (require.main === module) {
  const args = process.argv.slice(2);
  const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  runMockVr({
    url: option('--url'), baseReport: option('--report') ? readJson(option('--report')) : undefined,
    log: line => console.log(`[mock-vr] ${line}`)
  }).then(({ ack, reconnects }) => {
    console.log(`[mock-vr] acknowledged stored=${ack.stored}${ack.error ? ` error=${ack.error}` : ''} reconnects=${reconnects}`);
  }).catch(error => { console.error(`[mock-vr] ${error.message}`); process.exitCode = 1; });
}
