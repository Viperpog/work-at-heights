const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { deflateRawSync } = require('node:zlib');
const { Document, Packer, Paragraph } = require('docx');
const mammoth = require('mammoth');
const { root, renderer, mainProcess, completedState } = require('./helpers.cjs');
const security = require('../src/security.cjs');
const attack = '<img src=x onerror="globalThis.__injected=1"><script>alert(1)</script>&"\'';
const collectText = node => (node.textContent || '') + (node.children || []).map(collectText).join('');
const collectTags = node => [node.tagName, ...(node.children || []).flatMap(collectTags)].filter(Boolean);

test('imported AI/report and restored SmartChats content is rendered as literal text', async () => {
  const h = renderer({ selectVrReport: async () => ({ fileName: attack, text: attack }), callCimatec: async () => attack });
  await h.run('analyzeVrReport()');
  assert.ok(collectText(h.element('vrReportStatus')).includes(attack));
  assert.ok(!collectTags(h.element('vrReportStatus')).some(tag => ['IMG', 'SCRIPT', 'IFRAME'].includes(tag)));
  h.context.attack = attack;
  h.run("state.smartchatsCompleted=true; state.smartSummary=attack; state.expertiseAfterSmartChats=attack; renderSmartResults()");
  assert.ok(collectText(h.element('smartResults')).includes(attack));
  assert.equal(h.context.__injected, undefined);
});

test('quiz explanations and answer text do not become HTML elements', () => {
  const h = renderer();
  h.context.attack = attack;
  h.run("state.quiz.activeQuestion={module:1,difficulty:'basic',question:'Synthetic',options:[attack,'other'],correctIndex:0,points:1,explanation:attack}");
  h.document.querySelector = selector => selector.includes('data-quiz-option') ? { value: '0' } : null;
  h.run('submitQuizAnswer()');
  assert.ok(collectText(h.element('quizFeedback')).includes(attack));
  assert.ok(!collectTags(h.element('quizFeedback')).includes('IMG'));
  assert.equal(h.run('state.quiz.history[0].earnedPoints'), 1);
});

test('every privileged IPC operation rejects absent, foreign and child-frame senders', async () => {
  const main = mainProcess();
  const child = { parent: main.contents.mainFrame, url: main.contents.getURL() };
  for (const handler of main.rawHandlers.values()) {
    for (const event of [null, { sender: {}, senderFrame: null }, { sender: main.contents, senderFrame: child }]) {
      await assert.rejects(handler(event), /Untrusted IPC/);
    }
  }
  const frame = main.contents.mainFrame;
  frame.url = 'https://smartchats.info/course/whs';
  await assert.rejects(main.rawHandlers.get('read-json')(main.event, 'data/config.json'), /Untrusted/);
});

test('IPC rejects extra arguments and data-file traversal before native operations', async () => {
  const main = mainProcess();
  await assert.rejects(main.rawHandlers.get('save-ebook')(main.event, '/tmp/attack'), /Invalid IPC arguments/);
  await assert.rejects(main.rawHandlers.get('select-vr-report')(main.event, { filePath: '/tmp/private' }), /Invalid IPC arguments/);
  for (const file of ['../package.json', 'src/main.js', 'data/../config.json', null, {}]) await assert.rejects(main.handlers.get('read-json')(null, file), /Unsupported/);
});

test('only the existing HTTPS SmartChats course destination can open externally', async () => {
  const main = mainProcess();
  const valid = 'https://smartchats.info/course/whs?=learner%40example.invalid';
  assert.equal(await main.handlers.get('open-external')(null, valid), valid);
  for (const url of ['javascript:alert(1)', 'file:///C:/Windows/System32/cmd.exe', 'mailto:test@example.invalid',
    'http://smartchats.info/course/whs', 'https://smartchats.info.evil.invalid/course/whs', 'https://smartchats.info@evil.invalid/course/whs',
    'https://smartchats.info:444/course/whs', 'https://smartchats.info/redirect', 'https://smartchats.info/course/whs?redirect=evil',
    'https://smartchats.info/course/whs?=test%ZZ', 'https://smartchats.info/course/whs#attack']) {
    await assert.rejects(main.handlers.get('open-external')(null, url), /External URL/);
  }
});

test('window sandbox/navigation/resource/permission policies actively reject unsafe requests', () => {
  const main = mainProcess();
  const options = main.events.get('window-options').webPreferences;
  assert.equal(options.sandbox, true); assert.equal(options.contextIsolation, true); assert.equal(options.webSecurity, true);
  assert.equal(options.nodeIntegration, false); assert.equal(options.webviewTag, false);
  assert.deepEqual(JSON.parse(JSON.stringify(main.events.get('window-open')())), { action: 'deny' });
  let prevented = false;
  main.events.get('will-navigate')({ preventDefault: () => { prevented = true; } }, 'https://evil.invalid');
  assert.equal(prevented, true);
  for (const details of [{ isMainFrame: false, url: main.contents.getURL() }, { isMainFrame: true, url: 'https://evil.invalid' }]) {
    prevented = false;
    main.events.get('will-frame-navigate')({ ...details, preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
  }
  main.events.get('will-frame-navigate')({ isMainFrame: true, url: main.contents.getURL(), preventDefault: () => assert.fail('Legitimate document navigation denied') });
  let canceled;
  main.events.get('resource')({ url: security.pathToFileURL(path.join(root, 'package.json')).href, resourceType: 'script' }, result => { canceled = result.cancel; });
  assert.equal(canceled, true);
  main.events.get('resource')({ url: 'blob:null/synthetic-audio', resourceType: 'media' }, result => { canceled = result.cancel; });
  assert.equal(canceled, false);
  const details = { requestingUrl: main.contents.getURL(), isMainFrame: true, mediaType: 'audio', mediaTypes: ['audio'] };
  assert.equal(main.events.get('permission-check')(main.contents, 'media', 'file://', details), true);
  assert.equal(main.events.get('permission-check')(main.contents, 'media', 'file://', { ...details, mediaType: 'video' }), false);
  assert.equal(main.events.get('permission-check')(main.contents, 'media', 'file://', { ...details, requestingUrl: 'https://evil.invalid' }), false);
  assert.equal(main.events.get('permission-check')(main.contents, 'media', 'file://', { ...details, isMainFrame: false }), false);
  assert.equal(main.events.get('permission-check')(null, 'media', 'file://', details), false);
  let granted;
  main.events.get('permission-request')(main.contents, 'media', result => { granted = result; }, { ...details, mediaTypes: ['audio', 'video'] });
  assert.equal(granted, false);
  main.events.get('permission-request')(main.contents, 'media', result => { granted = result; }, details);
  assert.equal(granted, true);
});

test('certificate handler rejects incomplete or inconsistent evidence before opening a save dialog', async () => {
  const main = mainProcess();
  let dialogs = 0;
  main.dialog.showSaveDialog = async () => { dialogs++; return { canceled: true }; };
  const valid = completedState();
  const mutations = [s => { s.debriefingCompleted = false; }, s => { s.quiz.history = []; }, s => { s.quizScore = '100/100 (100%)'; },
    s => { s.expertiseAfterInterview = 'Expert'; }, s => { s.interview.history[0].question.maxScore = 999; },
    s => { s.quiz.history[0].earnedPoints = 999; }, s => { s.quiz.history.reverse(); }, s => { s.debriefing.history = []; },
    s => { s.studentEmail = 'invalid'; }];
  for (const mutate of mutations) {
    const state = JSON.parse(JSON.stringify(valid)); mutate(state);
    await assert.rejects(main.handlers.get('save-certificate')(null, state));
  }
  assert.equal(dialogs, 0);
  assert.equal((await main.handlers.get('save-certificate')(null, valid)).canceled, true);
  assert.equal(dialogs, 1);
});

test('restored legitimate completion exports again without changing certificate or readiness rules', async () => {
  const h = renderer(); h.context.saved = completedState();
  h.run('applySessionToState(saved)');
  assert.equal(h.run('state.certificateDownloaded'), false);
  const state = h.json('state');
  // JSON property order is not evidence integrity.
  state.interview.history[0].question = Object.fromEntries(Object.entries(state.interview.history[0].question).reverse());
  assert.equal((await mainProcess().handlers.get('save-certificate')(null, state)).canceled, true);
  const legacy = completedState('Expert'); legacy.smartQuestionCount = 0; legacy.vrExpertiseLevel = 'Not identified'; legacy.debriefing.vrReportText = '';
  assert.equal((await mainProcess().handlers.get('save-certificate')(null, legacy)).canceled, true);
});

test('invalid export payloads, huge text and protected destinations are rejected', async () => {
  const main = mainProcess();
  for (const input of [null, {}, { ...completedState(), studentName: 'x'.repeat(201) }]) await assert.rejects(main.handlers.get('save-interview-report')(null, input));
  const state = completedState(); state.debriefing.summary = 'x'.repeat(32001);
  await assert.rejects(main.handlers.get('save-debriefing-report')(null, state), /limits/);
  main.dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(root, 'src/attack.docx') });
  await assert.rejects(main.handlers.get('save-certificate')(null, completedState()), /application files/);
  assert.equal(fs.existsSync(path.join(root, 'src/attack.docx')), false);
  main.dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(os.tmpdir(), 'attack.exe') });
  await assert.rejects(main.handlers.get('save-ebook')(), /Word document destination/);
});

test('Word exports safely preserve XML metacharacters, Unicode and long text', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wah-word-security-'));
  try {
    const state = completedState(); state.studentName = 'Synthetic <&> " \' 😀\u0000';
    state.interview.history[0].answer = attack + 'x'.repeat(30000);
    state.interview.history[0].evaluation.explanation = attack + 'x'.repeat(30000);
    const main = mainProcess();
    for (const channel of ['save-interview-report', 'save-quiz-report', 'save-debriefing-report', 'save-certificate']) {
      const filePath = path.join(dir, channel + '.docx');
      main.dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      await main.handlers.get(channel)(null, state);
      const extracted = await mammoth.extractRawText({ path: filePath });
      assert.ok(extracted.value.includes('Synthetic <&> " \' 😀�'));
      if (channel === 'save-interview-report') {
        assert.ok(extracted.value.includes(attack));
        assert.ok(extracted.value.includes('x'.repeat(30000)));
      }
      security.validateZip(fs.readFileSync(filePath));
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

function zipEntry(name, content, claimedSize = content.length) {
  const nameBytes = Buffer.from(name), data = deflateRawSync(content);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(claimedSize, 22); local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(claimedSize, 24); central.writeUInt16LE(nameBytes.length, 28);
  const start = local.length + nameBytes.length + data.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + nameBytes.length, 12); end.writeUInt32LE(start, 16);
  return Buffer.concat([local, nameBytes, data, central, nameBytes, end]);
}

test('invalid, malicious and oversized Word archives are rejected before extraction', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wah-report-security-'));
  try {
    let extracts = 0;
    for (const bytes of [Buffer.from('not a document'), zipEntry('../escape.xml', Buffer.from('x')), zipEntry('word/document.xml', Buffer.from('<!DOCTYPE test>')),
      zipEntry('word/document.xml', Buffer.alloc(9 * 1024 * 1024, 65), 1)]) {
      const filePath = path.join(dir, 'invalid.docx'); fs.writeFileSync(filePath, bytes);
      await assert.rejects(security.readReport(filePath, async () => { extracts++; return { value: 'unsafe' }; }));
    }
    assert.equal(extracts, 0);
    const filePath = path.join(dir, 'empty.docx'); fs.writeFileSync(filePath, await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('')] }] })));
    assert.equal((await security.readReport(filePath, options => mammoth.extractRawText(options))).text.trim(), '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
