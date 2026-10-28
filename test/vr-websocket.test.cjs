// Phase 3 (gate G3): the WAH WebSocket server in the main process, driven by integration/vr/mock-vr.cjs. No file is exchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { WebSocketServer, WebSocket } = require('ws');
const { root, renderer, mainProcess } = require('./helpers.cjs');
const contract = require('../src/vr-contract.cjs');
const { createVrBridge, adbReverse, findAdb } = require('../src/vr-bridge.cjs');
const { runMockVr, upgradeReport, CAPABILITIES } = require('../integration/vr/mock-vr.cjs');

const example = name => JSON.parse(fs.readFileSync(path.join(root, 'integration/vr/examples', name), 'utf8'));
const SAFE_14 = example('vr-event-log.1.4.safe.quest.json');
const PARTIAL_14 = example('vr-event-log.1.4.partial-headset-removed.json');
const newPlan = (extra = {}) => contract.buildSessionPlan({ email: 'learner@example.invalid', smartChatsLevel: 'Basic', interviewLevel: 'Intermediate', quizLevel: 'Expert', quizScorePct: 90, ...extra });

async function withBridge(body) {
  const bridge = createVrBridge({ port: 0 });
  const port = await bridge.start();
  try { return await body(bridge, `ws://127.0.0.1:${port}/ws`); } finally { await bridge.stop(); }
}

// A raw VR client, for the steps mock-vr does not expose (closing before the ack, sending a crafted report).
async function rawClient(url) {
  const socket = new WebSocket(url);
  const inbox = [];
  const waiters = [];
  socket.on('message', raw => {
    const message = JSON.parse(String(raw));
    const i = waiters.findIndex(w => w.match(message));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(message); else inbox.push(message);
  });
  await once(socket, 'open');
  const next = (match = () => true, ms = 3000) => {
    const i = inbox.findIndex(match);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve: m => { clearTimeout(timer); resolve(m); } };
      const timer = setTimeout(() => { waiters.splice(waiters.indexOf(waiter), 1); reject(new Error('no message')); }, ms);
      waiters.push(waiter);
    });
  };
  const send = message => socket.send(typeof message === 'string' ? message : JSON.stringify(message));
  const env = (type, topic, payload, options = {}) => contract.makeEnvelope(type, topic, payload, { clientId: 'raw-vr', ...options });
  const hello = () => send(env('hello', null, { clientId: 'raw-vr', role: 'unreal', capabilities: CAPABILITIES }));
  const close = async () => { if (socket.readyState !== WebSocket.CLOSED) { socket.close(); await once(socket, 'close'); } };
  return { socket, next, send, env, hello, close, inbox };
}
const isTopic = topic => m => m.type === 'publish' && m.topic === topic;

// Sits between mock-vr and the server and cuts the connection once, at the first message that matches, without forwarding it.
async function cuttingProxy(target, cutAt) {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  let cut = false;
  server.on('connection', client => {
    const upstream = new WebSocket(target);
    const queue = [];
    let dead = false;
    const kill = () => { dead = true; client.terminate(); upstream.terminate(); };
    const relay = (direction, raw, to) => {
      if (dead) return;
      if (!cut && cutAt(direction, JSON.parse(String(raw)))) { cut = true; return kill(); }
      if (to.readyState === WebSocket.OPEN) to.send(String(raw)); else queue.push(String(raw));
    };
    upstream.on('open', () => { for (const raw of queue.splice(0)) upstream.send(raw); });
    client.on('message', raw => relay('up', raw, upstream));
    upstream.on('message', raw => relay('down', raw, client));
    client.on('close', () => upstream.terminate());
    upstream.on('close', () => client.terminate());
    upstream.on('error', () => {});
    client.on('error', () => {});
  });
  return { url: `ws://127.0.0.1:${server.address().port}/ws`, close: () => new Promise(resolve => { for (const c of server.clients) c.terminate(); server.close(resolve); }) };
}

test('G3 full cycle without a file: plan -> ack -> report -> ack, the result is rated and waits for the renderer', () => withBridge(async (bridge, url) => {
  const plan = newPlan();
  const notices = [];
  bridge.events.on('status', s => notices.push(s.plan?.state));
  bridge.setPlan(plan);
  const vr = await runMockVr({ url, baseReport: SAFE_14 });
  assert.equal(vr.planAck.accepted, true);
  assert.equal(vr.plan.plan_id, plan.plan_id);
  assert.equal(vr.planAck.applied_config.preset, 'intermediate'); // study pins the validated build
  assert.deepEqual([vr.ack.stored, vr.ack.session_id], [true, vr.report.session_id]);
  assert.equal(vr.reconnects, 0);
  const [result, ...rest] = bridge.takeReports();
  assert.equal(rest.length, 0);
  assert.deepEqual([result.kind, result.source, result.level, result.rule, result.bound, result.planId], ['json', 'websocket', 'Expert', 5, true, plan.plan_id]);
  assert.equal(result.sessionId, vr.report.session_id.toLowerCase());
  assert.match(result.text, /Scenario applied: intermediate preset, study mode/);
  assert.ok(!result.text.includes('{'));
  assert.deepEqual(bridge.takeReports(), []); // taken once
  assert.equal(bridge.status().plan.state, 'used');
  assert.ok(notices.includes('accepted') && notices.includes('used'));
}));

test('the server listens on loopback only, on /ws, and starts once', () => withBridge(async (bridge, url) => {
  const status = bridge.status();
  assert.equal(status.host, '127.0.0.1');
  assert.equal(await bridge.start(), status.port);
  const wrongPath = new WebSocket(url.replace('/ws', '/other'));
  const [error] = await once(wrongPath, 'error');
  assert.match(error.message, /400|Unexpected/);
}));

test('the plan is resent on every hello until it is acknowledged, then never again', () => withBridge(async (bridge, url) => {
  const plan = newPlan();
  bridge.setPlan(plan);
  const first = await rawClient(url);
  first.hello();
  const sent1 = await first.next(isTopic(contract.TOPICS.plan));
  assert.equal(sent1.requiresAck, true);
  assert.equal(bridge.status().plan.state, 'sent');
  await first.close(); // dropped before the ack
  const second = await rawClient(url);
  second.hello();
  const sent2 = await second.next(isTopic(contract.TOPICS.plan));
  assert.equal(sent2.payload.plan_id, plan.plan_id);
  // An ack that answers another message id or another plan is ignored.
  second.send(second.env('publish', contract.TOPICS.planAck, { plan_id: plan.plan_id, accepted: true, applied_config: contract.scenarioConfigFor(plan) }, { correlationId: 'not-a-plan-message' }));
  second.send(second.env('publish', contract.TOPICS.planAck, { plan_id: newPlan().plan_id, accepted: true, applied_config: contract.scenarioConfigFor(plan) }, { correlationId: sent2.id }));
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(bridge.status().plan.state, 'sent');
  // The ack may answer any copy of the plan (here the first one, from the closed connection).
  second.send(second.env('publish', contract.TOPICS.planAck, { plan_id: plan.plan_id, accepted: true, applied_config: contract.scenarioConfigFor(plan) }, { correlationId: sent1.id }));
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual([bridge.status().plan.state, bridge.status().plan.preset], ['accepted', 'intermediate']);
  await second.close();
  const third = await rawClient(url);
  third.hello();
  await assert.rejects(third.next(isTopic(contract.TOPICS.plan), 200));
  await third.close();
}));

test('a plan set while the headset is already connected goes out at once; a new plan replaces the old one', () => withBridge(async (bridge, url) => {
  const vr = await rawClient(url);
  vr.hello();
  await assert.rejects(vr.next(isTopic(contract.TOPICS.plan), 150)); // nothing to send yet
  const plan = newPlan();
  bridge.setPlan(plan);
  assert.equal((await vr.next(isTopic(contract.TOPICS.plan))).payload.plan_id, plan.plan_id);
  bridge.setPlan(plan); // the same plan again is not resent
  await assert.rejects(vr.next(isTopic(contract.TOPICS.plan), 150));
  const retake = newPlan();
  bridge.setPlan(retake);
  assert.equal((await vr.next(isTopic(contract.TOPICS.plan))).payload.plan_id, retake.plan_id);
  assert.equal(bridge.status().connected, true);
  await vr.close();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(bridge.status().connected, false);
}));

test('connection dropped before the plan ack: the report still arrives once after the reconnect', () => withBridge(async (bridge, url) => {
  const plan = newPlan();
  bridge.setPlan(plan);
  const proxy = await cuttingProxy(url, (direction, m) => direction === 'up' && m.topic === contract.TOPICS.planAck);
  try {
    const vr = await runMockVr({ url: proxy.url, baseReport: SAFE_14 });
    assert.ok(vr.reconnects >= 1);
    assert.equal(vr.ack.stored, true);
  } finally { await proxy.close(); }
  assert.equal(bridge.takeReports().length, 1);
  assert.equal(bridge.status().plan.state, 'used'); // the bound report proves the plan arrived, so it stops being resent
}));

test('connection dropped before the report ack: the VR resends, WAH acknowledges again and keeps one copy', () => withBridge(async (bridge, url) => {
  bridge.setPlan(newPlan());
  const proxy = await cuttingProxy(url, (direction, m) => direction === 'down' && m.topic === contract.TOPICS.reportAck);
  try {
    const vr = await runMockVr({ url: proxy.url, baseReport: SAFE_14 });
    assert.ok(vr.reconnects >= 1);
    assert.deepEqual([vr.ack.stored, vr.ack.session_id], [true, vr.report.session_id]);
  } finally { await proxy.close(); }
  assert.equal(bridge.takeReports().length, 1);
}));

test('reports are de-duplicated by session_id, also against reports imported by file', () => withBridge(async (bridge, url) => {
  const plan = newPlan();
  const sessionId = 'ABCDEF0123456789ABCDEF0123456789';
  bridge.setPlan(plan, [sessionId.toLowerCase()]);
  const vr = await rawClient(url);
  const report = upgradeReport(SAFE_14, plan, contract.scenarioConfigFor(plan), { sessionId });
  const message = vr.env('publish', contract.TOPICS.report, report, { requiresAck: true });
  vr.send(message);
  const ack = await vr.next(isTopic(contract.TOPICS.reportAck));
  assert.deepEqual([ack.correlationId, ack.payload.stored], [message.id, true]);
  assert.deepEqual(bridge.takeReports(), []);
  await vr.close();
}));

test('a report that answers another plan, has no plan, or is invalid is refused with stored:false and a field-only error', () => withBridge(async (bridge, url) => {
  const plan = newPlan();
  bridge.setPlan(plan);
  const vr = await rawClient(url);
  const sendReport = async report => {
    const message = typeof report === 'string' ? JSON.parse(report) : vr.env('publish', contract.TOPICS.report, report, { requiresAck: true });
    vr.send(typeof report === 'string' ? report : message);
    const ack = await vr.next(m => isTopic(contract.TOPICS.reportAck)(m) && m.correlationId === message.id);
    assert.doesNotThrow(() => contract.validateReportAck(ack.payload));
    return ack.payload;
  };
  const other = await sendReport(upgradeReport(SAFE_14, newPlan()));
  assert.equal(other.stored, false);
  assert.match(other.error, /different VR session plan/);
  const unplanned = await sendReport(upgradeReport(SAFE_14, null));
  assert.equal(unplanned.stored, false);
  const secret = 'secret-learner-value';
  const broken = { version: 1, id: 'msg-broken', type: 'publish', clientId: 'raw-vr', topic: contract.TOPICS.report, requiresAck: true,
    payload: { ...upgradeReport(SAFE_14, plan), verdict: secret } };
  const invalid = await sendReport(JSON.stringify(broken));
  assert.deepEqual([invalid.stored, invalid.session_id], [false, null]);
  assert.match(invalid.error, /report\.verdict/);
  assert.ok(!invalid.error.includes(secret));
  assert.deepEqual(bridge.takeReports(), []);
  assert.equal(bridge.status().lastReport.stored, false);
  assert.equal(bridge.status().plan.state, 'waiting'); // a refused report does not use the plan up
  // Garbage and unknown topics are ignored without closing the connection.
  vr.send('{not json');
  vr.send(vr.env('publish', 'experience.lifecycle', { state: 'running' }));
  const ok = await sendReport(upgradeReport(SAFE_14, plan, undefined, { sessionId: 'FEDCBA9876543210FEDCBA9876543210' }));
  assert.equal(ok.stored, true);
  await vr.close();
}));

test('an incomplete session is stored (not rated) and the same plan goes back out for the next session', () => withBridge(async (bridge, url) => {
  const plan = newPlan();
  bridge.setPlan(plan);
  const vr = await rawClient(url);
  vr.hello();
  const sent = await vr.next(isTopic(contract.TOPICS.plan));
  vr.send(vr.env('publish', contract.TOPICS.planAck, { plan_id: plan.plan_id, accepted: true, applied_config: contract.scenarioConfigFor(plan) }, { correlationId: sent.id }));
  const partial = upgradeReport(PARTIAL_14, plan);
  vr.send(vr.env('publish', contract.TOPICS.report, partial, { requiresAck: true }));
  assert.equal((await vr.next(isTopic(contract.TOPICS.reportAck))).payload.stored, true);
  const again = await vr.next(isTopic(contract.TOPICS.plan));
  assert.equal(again.payload.plan_id, plan.plan_id);
  const [result] = bridge.takeReports();
  assert.deepEqual([result.level, result.rule], [null, 2]);
  await vr.close();
}));

test('the port in use is reported clearly and the bridge can retry', async () => {
  const blocker = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(blocker, 'listening');
  const port = blocker.address().port;
  const bridge = createVrBridge({ port });
  await assert.rejects(bridge.start(), /already in use/);
  assert.equal(bridge.status().listening, false);
  await new Promise(resolve => blocker.close(resolve));
  assert.equal(await bridge.start(), port);
  await bridge.stop();
});

// ---- adb ----

const fakeAdb = outputs => {
  const calls = [];
  const run = (file, args, _options, done) => { calls.push([file, ...args]); const out = outputs.shift(); done(out.error || null, out.stdout || ''); };
  return { calls, run };
};

test('adb reverse: forwards 8787 on the first ready headset; missing adb, no headset and unauthorized give clear messages', async () => {
  const ok = fakeAdb([{ stdout: 'List of devices attached\r\n2G0YC1ZF8B0123\tdevice\r\n\r\n' }, { stdout: '8787\n' }]);
  const done = await adbReverse({ adbPath: 'adb', run: ok.run });
  assert.equal(done.ok, true);
  assert.deepEqual(ok.calls[1], ['adb', '-s', '2G0YC1ZF8B0123', 'reverse', 'tcp:8787', 'tcp:8787']);
  for (const [outputs, code, pattern] of [
    [[{ error: Object.assign(new Error('spawn adb ENOENT'), { code: 'ENOENT' }) }], 'adb_missing', /adb was not found.*WAH_ADB/],
    [[{ stdout: 'List of devices attached\n\n' }], 'no_device', /USB cable/],
    [[{ stdout: 'List of devices attached\nABC\tunauthorized\n' }], 'unauthorized', /Allow USB debugging/],
    [[{ stdout: 'List of devices attached\nABC\tdevice\n' }, { error: new Error('error: closed') }], 'failed', /could not forward/]
  ]) {
    const result = await adbReverse({ adbPath: 'adb', run: fakeAdb(outputs).run });
    assert.deepEqual([result.ok, result.code], [false, code]);
    assert.match(result.message, pattern);
  }
  assert.equal(findAdb({ WAH_ADB: 'C:/tools/adb.exe' }), 'C:/tools/adb.exe');
  assert.equal(findAdb({ LOCALAPPDATA: 'C:/Users/x/AppData/Local' }, file => file.includes('Sdk')), path.join('C:/Users/x/AppData/Local', 'Android', 'Sdk', 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'));
  assert.equal(findAdb({}, () => false), 'adb');
});

// ---- main process IPC ----

test('main process: Connect Quest starts the server, reports a missing adb, and the mock VR completes the cycle over IPC', async () => {
  const saved = { port: process.env.WAH_VR_PORT, adb: process.env.WAH_ADB };
  process.env.WAH_VR_PORT = '0';
  process.env.WAH_ADB = path.join(root, 'no-such-adb.exe');
  const main = mainProcess();
  try {
    const plan = await main.handlers.get('create-session-plan')(null, { email: 'learner@example.invalid', smartChatsLevel: 'Basic', interviewLevel: 'Basic', quizLevel: 'Intermediate', quizScorePct: 60 });
    for (const bad of [null, { plan, extra: 1 }, { plan: { ...plan, vr: { ...plan.vr, mode: 'pilot' } } }, { plan, seenSessionIds: 'x' }]) {
      await assert.rejects(main.handlers.get('vr-bridge-connect')(null, bad));
    }
    await assert.rejects(main.handlers.get('vr-bridge-status')(null, 'extra'), /Invalid IPC arguments/);
    const connected = await main.handlers.get('vr-bridge-connect')(null, { plan, seenSessionIds: [] });
    assert.equal(connected.server.ok, true);
    assert.deepEqual([connected.adb.ok, connected.adb.code], [false, 'adb_missing']);
    assert.equal(connected.status.listening, true);
    const vr = await runMockVr({ url: `ws://127.0.0.1:${connected.status.port}/ws`, baseReport: SAFE_14 });
    assert.equal(vr.ack.stored, true);
    assert.ok(main.sent.some(([channel, payload]) => channel === 'vr-bridge-event' && payload.type === 'report'));
    assert.ok(main.sent.every(([, payload]) => !JSON.stringify(payload).includes('"weather"'))); // notices carry status, never the report
    const status = await main.handlers.get('vr-bridge-status')();
    assert.equal(status.plan.state, 'used');
    const [result] = await main.handlers.get('vr-bridge-take-reports')();
    assert.deepEqual([result.level, result.planId], ['Expert', plan.plan_id]);
    assert.deepEqual(await main.handlers.get('vr-bridge-take-reports')(), []);
  } finally {
    await main.run('vrBridge.stop()');
    if (saved.port === undefined) delete process.env.WAH_VR_PORT; else process.env.WAH_VR_PORT = saved.port;
    if (saved.adb === undefined) delete process.env.WAH_ADB; else process.env.WAH_ADB = saved.adb;
  }
});

// ---- renderer ----

const bridgeResult = (extra = {}) => ({ canceled: false, kind: 'json', source: 'websocket', fileName: 'Quest (WebSocket)', sessionId: 'b'.repeat(32), bound: true, planId: 'plan-1', level: 'Expert', rule: 5, code: 'safe', reason: 'Safe.', text: 'VR session completed (end reason: Results).', ...extra });

test('step 5: Connect Quest sends the plan and the imported ids, shows the status and explains an adb failure', async () => {
  const infos = [];
  let input;
  const status = { listening: true, host: '127.0.0.1', port: 8787, connected: false, clientId: null, plan: { planId: 'plan-1', state: 'waiting', preset: null }, lastReport: null, pendingReports: 0 };
  const h = renderer({
    vrBridgeConnect: async value => { input = JSON.parse(JSON.stringify(value)); return { status, server: { ok: true }, adb: { ok: false, code: 'no_device', message: 'No headset found. Connect the Quest with a USB cable.' } }; },
    vrBridgeTakeReports: async () => []
  });
  h.context.window.wahDialogs.showInfo = async options => infos.push(options);
  h.run("state.vrPlan = { plan_id: 'plan-1' }; state.vrSessionIds = ['" + 'c'.repeat(32) + "']");
  await h.run('connectQuest()');
  assert.deepEqual(input, { plan: { plan_id: 'plan-1' }, seenSessionIds: ['c'.repeat(32)] });
  assert.match(infos.at(-1).message, /USB cable/);
  const text = h.element('vrBridgeStatus').children.map(n => (n.textContent || '') + n.children.map(c => c.textContent).join('')).join(' ');
  assert.match(text, /Waiting for the Quest on 127\.0\.0\.1:8787/);
  assert.match(text, /waiting for the headset/);
  h.run("renderBridgeStatus({ listening: true, host: '127.0.0.1', port: 8787, connected: true, clientId: '<img src=x>', plan: { state: 'accepted' }, lastReport: { stored: false, error: 'Invalid VR contract field: report.verdict' } })");
  const shown = JSON.stringify(h.element('vrBridgeStatus').children.map(n => n.children.map(c => c.textContent)));
  assert.match(shown, /Quest connected \(<img src=x>\)/); // device text is shown as text, never markup
  assert.match(shown, /accepted by the headset/);
  assert.match(shown, /refused: Invalid VR contract field: report\.verdict/);
  const failing = renderer({ vrBridgeConnect: async () => ({ status: { listening: false }, server: { ok: false, message: 'Port 8787 is already in use on this computer.' }, adb: null }), vrBridgeTakeReports: async () => [] });
  failing.context.window.wahDialogs.showInfo = async options => infos.push(options);
  failing.run("state.vrPlan = { plan_id: 'plan-1' }");
  await failing.run('connectQuest()');
  assert.match(infos.at(-1).message, /already in use.*Save VR Session Plan/);
});

test('step 5: a report that arrives over WebSocket is imported like a file; stale plans and repeats are skipped', async () => {
  let queue = [bridgeResult({ planId: 'old-plan', sessionId: 'd'.repeat(32) }), bridgeResult(), bridgeResult()];
  const h = renderer({ vrBridgeTakeReports: async () => queue.splice(0), callCimatec: async () => 'The learner completed the simulation with safe decisions in the storm.' });
  await h.run('receiveBridgeReports()');
  assert.equal(queue.length, 3, 'nothing is pulled before the learner has a plan');
  h.run("state.vrPlan = { plan_id: 'plan-1' }");
  await h.run('receiveBridgeReports()');
  assert.equal(h.run('state.vrExpertiseLevel'), 'Expert');
  assert.equal(h.run('state.vrCompleted'), true);
  assert.deepEqual(h.json('state.vrSessionIds'), ['b'.repeat(32)]);
  assert.equal(h.run('state.debriefing.vrReportFileName'), 'Quest (WebSocket)');
});
