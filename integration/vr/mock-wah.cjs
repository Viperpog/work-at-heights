#!/usr/bin/env node
// Simulated WAH bridge: the WebSocket server the Electron main process will run in phase 3, so the VR
// side can be developed without the desktop app. Listens on loopback only; the Quest reaches it with
// `adb reverse tcp:8787 tcp:8787`. One plan per run, resent on reconnect until the VR acknowledges it.
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { WebSocketServer, WebSocket } = require('ws');
const contract = require('../../src/vr-contract.cjs');

const DEFAULT_PLAN = path.join(__dirname, 'examples', 'session-plan.training-basic.json');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function looseEnvelope(raw) {
  try {
    const message = JSON.parse(String(raw));
    return message && typeof message === 'object' ? message : null;
  } catch (_) { return null; }
}

// dropFirstAck: store the first report, then cut the connection without acknowledging it, to exercise the VR's resend.
function startMockWah({ host = '127.0.0.1', port = 8787, plan = readJson(DEFAULT_PLAN), outDir = null, dropFirstAck = false, log = () => {} } = {}) {
  contract.validateSessionPlan(plan);
  const events = new EventEmitter();
  const reports = new Map();
  let planMessage = null, planAcked = false, ackDropped = false;
  const server = new WebSocketServer({ host, port, path: '/ws', maxPayload: contract.MAX_MESSAGE_BYTES });
  const ready = new Promise((resolve, reject) => {
    server.once('listening', () => resolve(server.address().port));
    server.once('error', reject);
  });

  server.on('connection', socket => {
    const send = message => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
    const ackReport = (correlationId, payload) => {
      try { send(contract.makeEnvelope('publish', contract.TOPICS.reportAck, payload, { correlationId })); } catch (_) { log('report without a usable message id: not acknowledged'); }
    };
    socket.on('message', raw => {
      let message;
      try { message = contract.parseMessage(raw); }
      catch (error) {
        // An invalid report is answered (stored: false) so the VR stops resending it; nothing is kept.
        const loose = looseEnvelope(raw);
        if (loose?.topic === contract.TOPICS.report && typeof loose.id === 'string') ackReport(loose.id, { session_id: null, stored: false, error: error.message });
        log(`invalid message: ${error.message}`);
        events.emit('invalid', error);
        return;
      }
      if (message.type === 'hello') {
        log(`VR connected client=${message.payload.clientId}`);
        events.emit('hello', message.payload);
        if (!planAcked) {
          planMessage = contract.makeEnvelope('publish', contract.TOPICS.plan, plan, { requiresAck: true });
          send(planMessage);
          log(`plan sent plan_id=${plan.plan_id} mode=${plan.vr.mode} level=${plan.vr.level}`);
        }
        return;
      }
      if (message.type !== 'publish') return;
      if (message.topic === contract.TOPICS.planAck) {
        if (message.correlationId !== planMessage?.id || message.payload.plan_id !== plan.plan_id) return log('stale plan ack ignored');
        planAcked = true;
        log(`plan ${message.payload.accepted ? `accepted preset=${message.payload.applied_config.preset}` : `rejected: ${message.payload.error}`}`);
        events.emit('plan_ack', message.payload);
        return;
      }
      if (message.topic === contract.TOPICS.report) {
        const report = message.payload;
        // A report answering another learner's plan is refused; a report without a plan is kept and flagged.
        if (report.plan && report.plan.plan_id !== plan.plan_id) {
          ackReport(message.id, { session_id: report.session_id, stored: false, error: 'Report belongs to another plan.' });
          log(`report refused: other plan session=${report.session_id}`);
          return;
        }
        const duplicate = reports.has(report.session_id);
        if (!duplicate) {
          reports.set(report.session_id, report);
          if (outDir) {
            fs.mkdirSync(outDir, { recursive: true });
            fs.writeFileSync(path.join(outDir, `vr_report_${report.session_id}.json`), JSON.stringify(report, null, 2));
          }
        }
        log(`report ${duplicate ? 'duplicate ' : ''}session=${report.session_id} verdict=${report.verdict} classification=${report.safety_classification} said_vs_did=${report.weather.said_vs_did ?? 'n/a'}`);
        events.emit('report', { report, duplicate, withPlan: Boolean(report.plan) });
        if (dropFirstAck && !ackDropped) { ackDropped = true; log('dropping the connection before the ack'); socket.terminate(); return; }
        ackReport(message.id, { session_id: report.session_id, stored: true });
        return;
      }
      events.emit('topic', message.topic, message.payload);
    });
  });

  const close = () => new Promise(resolve => {
    for (const client of server.clients) client.terminate();
    server.close(() => resolve());
  });
  return { events, reports, ready, close };
}

module.exports = { startMockWah };

if (require.main === module) {
  const args = process.argv.slice(2);
  const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const wah = startMockWah({
    port: option('--port') ? Number(option('--port')) : undefined,
    plan: option('--plan') ? readJson(option('--plan')) : undefined,
    outDir: option('--out'), dropFirstAck: args.includes('--drop-first-ack'), log: line => console.log(`[mock-wah] ${line}`)
  });
  wah.ready.then(port => console.log(`[mock-wah] listening on ws://127.0.0.1:${port}/ws (Ctrl+C to stop)`))
    .catch(error => { console.error(`[mock-wah] ${error.message}`); process.exitCode = 1; });
}
