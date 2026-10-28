// WAH side of the SafeHeight VR bridge (phase 3): the WebSocket server of integration/vr/README.md, run by the Electron main process.
// Loopback only; the Quest reaches it through `adb reverse tcp:8787 tcp:8787`. The renderer never opens a socket (CSP connect-src 'none'):
// it hands the plan over IPC and receives only validated, rated results (the same shape as a JSON file import).
const { EventEmitter } = require('node:events');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer, WebSocket } = require('ws');
const contract = require('./vr-contract.cjs');

const DEFAULT_PORT = 8787;
const HOST = '127.0.0.1';

function looseEnvelope(raw) {
  try {
    const message = JSON.parse(String(raw));
    return message && typeof message === 'object' && !Array.isArray(message) ? message : null;
  } catch (_) { return null; }
}

// Plan states shown in step 5: waiting (not sent yet) -> sent -> accepted | rejected -> used (a report answered it).
function createVrBridge({ port = DEFAULT_PORT, log = () => {} } = {}) {
  const events = new EventEmitter();
  const greeted = new Set(); // sockets that said hello
  const planMessageIds = new Set(); // envelope ids sent for the current plan; an ack must answer one of them
  const seen = new Set(); // session ids already stored (lower case), here or by file import
  const inbox = []; // accepted results waiting for the renderer
  let server = null, listening = null, boundPort = null;
  let plan = null, planState = 'none', appliedPreset = null, client = null, lastReport = null;

  const status = () => ({
    listening: boundPort !== null, host: HOST, port: boundPort ?? port, connected: greeted.size > 0, clientId: client,
    plan: plan ? { planId: plan.plan_id, state: planState, preset: appliedPreset } : null,
    lastReport, pendingReports: inbox.length
  });
  const changed = () => events.emit('status', status());
  const send = (socket, message) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };

  function sendPlan(socket) {
    const message = contract.makeEnvelope('publish', contract.TOPICS.plan, plan, { requiresAck: true });
    planMessageIds.add(message.id);
    send(socket, message);
    if (planState === 'waiting') planState = 'sent';
    log(`plan sent plan_id=${plan.plan_id}`);
  }
  const offerPlan = () => { if (plan && ['waiting', 'sent'].includes(planState)) for (const socket of greeted) sendPlan(socket); };

  function ackReport(socket, correlationId, payload) {
    try { send(socket, contract.makeEnvelope('publish', contract.TOPICS.reportAck, payload, { correlationId })); }
    catch (_) { log('report without a usable message id: not acknowledged'); }
  }

  function onReport(socket, message) {
    const report = message.payload;
    const sessionId = report.session_id.toLowerCase();
    // A resend after a lost ack (or a report already imported from the file): acknowledge again, keep one copy.
    if (seen.has(sessionId)) {
      ackReport(socket, message.id, { session_id: report.session_id, stored: true });
      log(`report duplicate session=${report.session_id}`);
      return;
    }
    const verdict = contract.judgeVrLog(report, { planId: plan ? plan.plan_id : null });
    if (!verdict.accepted) {
      ackReport(socket, message.id, { session_id: report.session_id, stored: false, error: verdict.message });
      lastReport = { stored: false, error: verdict.message };
      log(`report refused (${verdict.code}) session=${report.session_id}`);
      return changed();
    }
    seen.add(sessionId);
    const result = { canceled: false, fileName: 'Quest (WebSocket)', source: 'websocket', ...contract.importedReport(verdict) };
    inbox.push(result);
    // One plan per session: a bound report uses the plan up. An incomplete session needs the same plan again, so it goes back out.
    if (verdict.bound && plan) {
      planState = result.rule === 2 ? 'waiting' : 'used';
      if (planState === 'waiting') offerPlan();
    }
    lastReport = { stored: true, sessionId, level: result.level, rule: result.rule };
    ackReport(socket, message.id, { session_id: report.session_id, stored: true });
    log(`report stored session=${report.session_id} rule=${result.rule}`);
    changed();
    events.emit('report', result);
  }

  function onMessage(socket, raw) {
    let message;
    try { message = contract.parseMessage(raw); }
    catch (error) {
      // An invalid report is answered (stored: false) so the VR stops resending it; the error names the field, never the value.
      const loose = looseEnvelope(raw);
      if (loose?.topic === contract.TOPICS.report && typeof loose.id === 'string' && loose.id.length <= 64) {
        ackReport(socket, loose.id, { session_id: null, stored: false, error: error.message });
        lastReport = { stored: false, error: error.message };
        changed();
      }
      log(`invalid message: ${error.message}`);
      return;
    }
    if (message.type === 'hello') {
      greeted.add(socket);
      client = message.payload.clientId;
      log(`VR connected client=${client}`);
      if (plan && ['waiting', 'sent'].includes(planState)) sendPlan(socket);
      return changed();
    }
    if (message.type !== 'publish') return;
    if (message.topic === contract.TOPICS.planAck) {
      if (!plan || message.payload.plan_id !== plan.plan_id || !planMessageIds.has(message.correlationId)) return log('stale plan ack ignored');
      if (planState === 'used') return;
      planState = message.payload.accepted ? 'accepted' : 'rejected';
      appliedPreset = message.payload.accepted ? message.payload.applied_config.preset : null;
      log(`plan ${planState}`);
      return changed();
    }
    if (message.topic === contract.TOPICS.report) return onReport(socket, message);
  }

  function start() {
    if (listening) return listening;
    server = new WebSocketServer({ host: HOST, port, path: '/ws', maxPayload: contract.MAX_MESSAGE_BYTES });
    listening = new Promise((resolve, reject) => {
      server.once('listening', () => { boundPort = server.address().port; log(`listening on ws://${HOST}:${boundPort}/ws`); changed(); resolve(boundPort); });
      server.once('error', error => {
        server.close();
        server = null; listening = null;
        reject(new Error(error.code === 'EADDRINUSE'
          ? `Port ${port} is already in use on this computer (another WAH window or the mock server?). Close it and try again.`
          : 'The VR connection could not be started on this computer.'));
      });
    });
    server.on('connection', socket => {
      socket.on('message', raw => onMessage(socket, raw));
      socket.on('error', () => {});
      socket.on('close', () => {
        if (greeted.delete(socket)) { if (!greeted.size) client = null; log('VR disconnected'); changed(); }
      });
    });
    return listening;
  }

  // A new plan (another learner, a retake) replaces the old one and is offered to a headset that is already connected.
  function setPlan(next, seenSessionIds = []) {
    if (next) contract.validateSessionPlan(next);
    for (const id of seenSessionIds) seen.add(String(id).toLowerCase());
    if (!(plan && next && plan.plan_id === next.plan_id)) {
      plan = next ? structuredClone(next) : null;
      planState = plan ? 'waiting' : 'none';
      appliedPreset = null;
      planMessageIds.clear();
      offerPlan();
    }
    changed();
  }

  const takeReports = () => inbox.splice(0);

  function stop() {
    if (!server) return Promise.resolve();
    const closing = server;
    server = null; listening = null; boundPort = null;
    for (const socket of closing.clients) socket.terminate();
    greeted.clear();
    client = null;
    return new Promise(resolve => closing.close(() => { changed(); resolve(); }));
  }

  return { events, start, stop, setPlan, takeReports, status };
}

// adb lookup: WAH_ADB or ADB, then the Android SDK folders, then PATH.
function findAdb(env = process.env, exists = fs.existsSync) {
  if (env.WAH_ADB) return env.WAH_ADB;
  if (env.ADB) return env.ADB;
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const roots = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Android', 'Sdk')].filter(Boolean);
  return roots.map(root => path.join(root, 'platform-tools', exe)).find(file => exists(file)) || 'adb';
}

const ADB_MESSAGES = {
  adb_missing: 'adb was not found. Install Android platform-tools (or Meta Quest Developer Hub) and add adb to PATH, or set WAH_ADB to its full path. Save VR Session Plan still works without it.',
  no_device: 'No headset found. Connect the Quest with a USB cable, put it on and accept "Allow USB debugging".',
  unauthorized: 'The Quest is connected but USB debugging is not authorized. Put the headset on and accept "Allow USB debugging", then try again.',
  failed: 'adb could not forward the VR port to the headset. Reconnect the USB cable and try again.'
};

// `adb reverse tcp:<port> tcp:<port>`: the headset's 127.0.0.1:<port> reaches this computer over USB, nothing is exposed on the network.
function adbReverse({ port = DEFAULT_PORT, adbPath = findAdb(), run = execFile, timeoutMs = 10000 } = {}) {
  const adb = args => new Promise(resolve => {
    run(adbPath, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout) => resolve({ error, stdout: String(stdout || '') }));
  });
  const failure = code => ({ ok: false, code, message: ADB_MESSAGES[code] });
  return adb(['devices']).then(async ({ error, stdout }) => {
    if (error) return failure(error.code === 'ENOENT' || error.code === 'EACCES' ? 'adb_missing' : 'failed');
    const devices = stdout.split(/\r?\n/).slice(1).map(line => line.trim().split(/\s+/)).filter(parts => parts.length >= 2);
    const ready = devices.filter(([, state]) => state === 'device');
    if (!ready.length) return failure(devices.some(([, state]) => state === 'unauthorized') ? 'unauthorized' : 'no_device');
    const serial = ready[0][0];
    const reverse = await adb(['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
    if (reverse.error) return failure('failed');
    return { ok: true, code: 'reversed', message: `Quest port ${port} forwarded to this computer.`, devices: ready.length };
  });
}

module.exports = { createVrBridge, adbReverse, findAdb, DEFAULT_PORT, ADB_MESSAGES };
