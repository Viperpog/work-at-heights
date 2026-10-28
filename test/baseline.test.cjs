const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const Papa = require('papaparse');
const mammoth = require('mammoth');
const { root, renderer, mainProcess, completedState, worker } = require('./helpers.cjs');
const bank = JSON.parse(fs.readFileSync(path.join(root, 'data/question-bank.json')));
const quiz = JSON.parse(fs.readFileSync(path.join(root, 'data/final-quiz-bank.json')));

test('bundled banks cover every module/difficulty with unique IDs and valid scoring', () => {
  for (const rows of [bank, quiz]) {
    assert.equal(rows.length, 240);
    assert.equal(new Set(rows.map(q => q.id)).size, rows.length);
    for (let module = 1; module <= 8; module++) for (const level of ['basic', 'intermediate', 'expert']) {
      assert.equal(rows.filter(q => q.module === module && q.difficulty === level).length, 10);
    }
  }
  for (const q of quiz) {
    assert.ok(q.points > 0);
    assert.ok(Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.options.length);
  }
});

test('orientation validates email and requires a name longer than one character', () => {
  const h = renderer();
  h.element('studentName').value = 'Synthetic Learner';
  h.element('studentEmail').value = 'learner@example.invalid';
  h.run('refreshTab1()');
  assert.equal(h.element('completeLearning').disabled, false);
  h.element('studentEmail').value = 'invalid';
  h.run('refreshTab1()');
  assert.equal(h.element('completeLearning').disabled, true);
  h.element('studentEmail').value = 'learner@example.invalid';
  h.element('studentName').value = 'A';
  h.run('refreshTab1()');
  assert.equal(h.element('completeLearning').disabled, true);
});

test('CSV parsing and SmartChats classification preserve aliases and existing empty-data Expert rule', () => {
  const h = renderer();
  h.run("state.studentEmail = 'learner@example.invalid'");
  const rows = Papa.parse('email,question\nlearner@example.invalid,what is a harness\nother@example.invalid,why stop', { header: true }).data;
  h.context.rows = rows;
  assert.equal(h.run('classifySmartChats(rows).level'), 'Basic');
  assert.equal(h.run('classifySmartChats([]).level'), 'Expert');
  h.context.rows = [
    { studentEmail: ' LEARNER@EXAMPLE.INVALID ', Question: 'why stop' },
    { email: 'learner@example.invalid', message: 'how assess weather' }
  ];
  assert.equal(h.run('classifySmartChats(rows).level'), 'Expert');
  h.context.rows = [{ email: 'learner@example.invalid', question: 'harness inspection' }];
  assert.equal(h.run('classifySmartChats(rows).level'), 'Intermediate');
});

test('interview progression increases difficulty or advances module on non-correct answers', () => {
  const h = renderer();
  h.run('state.interview.currentModule = 2');
  for (const [correct, level, expected] of [
    [true, 'basic', { module: 2, level: 'intermediate' }],
    [true, 'intermediate', { module: 2, level: 'expert' }],
    [true, 'expert', { module: 3, level: 'expert' }],
    [false, 'expert', { module: 3, level: 'basic' }]
  ]) assert.deepEqual(h.json(`advanceInterview(${correct}, '${level}')`), expected);
});

test('quiz progression includes mandatory Module 5 Expert presentation', () => {
  const h = renderer();
  assert.deepEqual(h.json("advanceQuiz(false, {module:5, difficulty:'basic'})"), { module: 5, level: 'expert' });
  assert.deepEqual(h.json("advanceQuiz(true, {module:5, difficulty:'basic'})"), { module: 5, level: 'intermediate' });
  assert.deepEqual(h.json("advanceQuiz(false, {module:5, difficulty:'intermediate'})"), { module: 5, level: 'expert' });
  assert.deepEqual(h.json("advanceQuiz(false, {module:5, difficulty:'expert'})"), { module: 6, level: 'basic' });
  assert.deepEqual(h.json("advanceQuiz(true, {module:8, difficulty:'expert'})"), { module: 9, level: 'expert' });
});

test('quiz classification boundaries remain 50 and 85 percent', () => {
  const h = renderer();
  for (const [score, level] of [[0, 'Basic'], [49, 'Basic'], [50, 'Intermediate'], [84, 'Intermediate'], [85, 'Expert'], [100, 'Expert']]) {
    assert.equal(h.run(`classifyQuizLevel(${score})`), level);
  }
});

test('quiz submission awards points only for the selected correct answer; missing selection does nothing', () => {
  const h = renderer();
  h.context.question = quiz[0];
  h.run('state.quiz.activeQuestion = question');
  h.run('submitQuizAnswer()');
  assert.equal(h.run('state.quiz.history.length'), 0);
  for (const [selectedIndex, points] of [[quiz[0].correctIndex, quiz[0].points], [(quiz[0].correctIndex + 1) % quiz[0].options.length, 0]]) {
    h.document.querySelector = selector => selector.includes('data-quiz-option') ? { value: String(selectedIndex) } : null;
    h.run('submitQuizAnswer()');
    assert.equal(h.run('state.quiz.history.at(-1).earnedPoints'), points);
  }
  h.run('finishQuizAdaptive()');
  assert.equal(h.run('state.quizCompleted'), true);
  assert.equal(h.run('state.quizScore'), `${quiz[0].points}/${2 * quiz[0].points} (50%)`);
});

test('overall readiness agrees between main and renderer at thresholds, including missing levels', () => {
  const h = renderer();
  const main = mainProcess();
  for (const [levels, expected] of [
    [[null, null, null, null], 'Basic'],
    [['Expert', 'Intermediate', 'Basic', 'Basic'], 'Intermediate'],
    [['Expert', 'Expert', 'Expert', 'Intermediate'], 'Expert']
  ]) {
    const state = Object.fromEntries(['expertiseAfterSmartChats', 'expertiseAfterInterview', 'expertiseAfterQuiz', 'vrExpertiseLevel'].map((key, i) => [key, levels[i]]));
    h.context.sample = state;
    h.run('Object.assign(state, sample)');
    assert.equal(h.run('calculateOverallReadiness()'), expected);
    assert.equal(main.run(`calculateOverallReadiness(${JSON.stringify(state)})`), expected);
  }
});

test('session save normalizes email; malformed storage and invalid email do not restore', () => {
  const h = renderer();
  h.run("state.studentEmail = ' Learner@Example.Invalid '; saveSession()");
  assert.equal(h.storage.size, 0); // Existing validator does not trim before save.
  h.run("state.studentEmail = 'Learner@Example.Invalid'; saveSession()");
  assert.equal(h.storage.size, 1);
  assert.equal(h.run("loadSavedSession('learner@example.invalid').studentEmail"), 'Learner@Example.Invalid');
  h.storage.set('workingAtHeightSession:learner@example.invalid', '{bad');
  assert.equal(h.run("loadSavedSession('learner@example.invalid')"), null);
  h.run("clearSavedSession('learner@example.invalid')");
  assert.equal(h.storage.size, 0);
});

test('restoration preserves completed stages but resets incomplete interview and downstream work', () => {
  const h = renderer();
  h.run('rebuildInterfaceFromState = () => {}'); // Isolate persistence policy from DOM rendering.
  h.run(`applySessionToState({studentEmail:'learner@example.invalid', orientationCompleted:true,
    smartchatsCompleted:true, expertiseAfterSmartChats:'Intermediate', selectedInstructorId:'missing',
    interview:{history:[{answer:'synthetic'}]}, quizCompleted:true})`);
  assert.equal(h.run('state.currentTab'), 3);
  assert.equal(h.run('state.expertiseAfterSmartChats'), 'Intermediate');
  assert.equal(h.run('state.interview.history.length'), 0);
  assert.equal(h.run('state.quizCompleted'), false);
  assert.equal(h.run('state.selectedInstructorId'), 'jake');
});

test('navigation identifies each of the seven unfinished stages', () => {
  const h = renderer();
  const flags = ['orientationCompleted', 'smartchatsCompleted', 'interviewCompleted', 'quizCompleted', 'vrCompleted', 'debriefingCompleted'];
  assert.equal(h.run('getFirstUnfinishedTab()'), 1);
  flags.forEach((flag, index) => {
    h.run(`state.${flag} = true`);
    assert.equal(h.run('getFirstUnfinishedTab()'), index + 2);
  });
});

test('completed restoration preserves existing reset of certificateDownloaded', () => {
  const h = renderer();
  h.run('rebuildInterfaceFromState = () => {}');
  h.run('applySessionToState({orientationCompleted:true,smartchatsCompleted:true,interviewCompleted:true,quizCompleted:true,vrCompleted:true,debriefingCompleted:true,certificateDownloaded:true})');
  assert.equal(h.run('state.currentTab'), 7);
  assert.equal(h.run('state.certificateDownloaded'), false);
});

test('AI failure and malformed JSON use local fallback; disabled fallback propagates failure', async () => {
  for (const callCimatec of [async () => { throw new Error('synthetic offline'); }, async () => 'not JSON']) {
    const h = renderer({ callCimatec });
    h.context.question = bank[0];
    h.run('config.useLocalFallbackWhenApiFails = true');
    const result = await h.run("evaluateWithApi(question, '', false)");
    assert.equal(result.correctness, 'Incorrect');
    assert.equal(result.score, 0);
    h.run('config.useLocalFallbackWhenApiFails = false');
    await assert.rejects(h.run("evaluateWithApi(question, '', false)"));
  }
});

test('skipped answer avoids AI; valid AI JSON is normalized', async () => {
  let calls = 0;
  const h = renderer({ callCimatec: async () => {
    calls++;
    return JSON.stringify({ evaluation: { score: 999, correctness: 'Correct', isCorrect: true } });
  } });
  h.context.question = bank[0];
  assert.equal((await h.run("evaluateWithApi(question, '', true)")).score, 0);
  assert.equal(calls, 0);
  assert.equal((await h.run("evaluateWithApi(question, 'synthetic', false)")).score, bank[0].maxScore);
  assert.equal(calls, 1);
});

test('VR analysis preserves empty-report completion behavior; debrief fallback ends on fourth answer', async () => {
  const h = renderer({
    selectVrReport: async () => ({ canceled: false, fileName: 'synthetic.docx', text: '' }),
    callCimatec: async () => { throw new Error('synthetic offline'); }
  });
  await h.run('analyzeVrReport()');
  assert.equal(h.run('state.vrCompleted'), true);
  assert.equal(h.run('state.vrExpertiseLevel'), 'Not identified');
  for (let i = 1; i <= 4; i++) {
    const response = await h.run("nextDebriefingMessage('Synthetic reflection')");
    assert.equal(response.complete, i === 4);
  }
});

test('preload API routes each exposed operation to a registered main handler', () => {
  const main = mainProcess();
  let api;
  const calls = [];
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/preload.js'), 'utf8'), {
    require: () => ({ contextBridge: { exposeInMainWorld: (name, value) => { assert.equal(name, 'appApi'); api = value; } },
      ipcRenderer: { invoke: (...args) => calls.push(args) } })
  });
  for (const fn of Object.values(api)) fn({ synthetic: true });
  assert.equal(calls.length, 13);
  for (const [channel] of calls) assert.ok(main.handlers.has(channel), channel);
});

test('real DOCX libraries export unchanged reports and import VR text; canceled PDF save remains canceled', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wah-test-'));
  try {
    const h = renderer();
    h.run("state.studentName = 'Synthetic Learner'; state.studentEmail = 'learner@example.invalid'");
    const state = completedState();
    const main = mainProcess();
    for (const channel of ['save-interview-report', 'save-quiz-report', 'save-debriefing-report', 'save-ebook']) {
      const filePath = path.join(dir, `${channel}.docx`);
      main.dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      await main.handlers.get(channel)(... (channel === 'save-ebook' ? [] : [null, state]));
      const extracted = await mammoth.extractRawText({ path: filePath });
      assert.ok(extracted.value.length > 0, channel);
      if (channel !== 'save-ebook') assert.match(extracted.value, /Synthetic Learner/);
    }
    main.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(dir, 'save-debriefing-report.docx')] });
    assert.match((await main.handlers.get('select-vr-report')()).text, /Synthetic Learner/);
    const invalid = path.join(dir, 'invalid.docx');
    fs.writeFileSync(invalid, 'not a Word document');
    main.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [invalid] });
    await assert.rejects(main.handlers.get('select-vr-report')());
    main.dialog.showSaveDialog = async () => ({ canceled: true });
    assert.equal((await main.handlers.get('save-certificate')(null, state)).canceled, true);
  } finally {
    // Only the fresh test-owned temporary directory is removed.
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('desktop chat payload reaches UF Worker with personas and conversation preserved', async () => {
  const messages = [{ role: 'system', content: 'Synthetic instructor persona' }, { role: 'user', content: 'Synthetic context' }];
  const main = mainProcess(async (_url, options) => {
    const response = await worker('cloudflare-worker.js', async (url, upstream) => {
      assert.equal(new URL(url).hostname, 'api.ai.it.ufl.edu');
      assert.deepEqual(JSON.parse(upstream.body).messages, messages);
      return Response.json({ choices: [{ message: { content: 'Synthetic UF response' } }] });
    }).fetch(new Request('https://example.invalid', options), { UF_API_KEY: 'test-only-not-a-key' });
    assert.equal(response.status, 200);
    return response;
  });
  assert.equal(await main.handlers.get('call-cimatec')(null, { messages }), 'Synthetic UF response');
});

test('voice Worker accepts desktop chat, transcription and synthesis contracts with fake upstream', async () => {
  const seen = [];
  const upstream = async (url, options) => {
    seen.push({ url, options });
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } });
    if (url.endsWith('/audio/transcriptions')) return Response.json({ text: 'Synthetic transcript' });
    return Response.json({ choices: [{ message: { content: 'Synthetic response' } }] });
  };
  const w = worker('src/cloudflare-transcription-worker.js', upstream);
  const main = mainProcess((_url, options) => w.fetch(new Request('https://example.invalid', options), { OPENAI_API_KEY: 'test-only-not-a-real-key' }));
  assert.equal(await main.handlers.get('call-cimatec')(null, { messages: [{ role: 'user', content: 'synthetic' }] }), 'Synthetic response');
  assert.equal((await main.handlers.get('transcribe-audio')(null, { audioBase64: 'AQID', mimeType: 'audio/webm' })).text, 'Synthetic transcript');
  assert.equal((await main.handlers.get('synthesize-speech')(null, { text: 'Synthetic test' })).audioBase64, 'AQID');
  assert.equal(seen.length, 3);
  await assert.rejects(main.handlers.get('transcribe-audio')(null, {}), /No audio/);
  await assert.rejects(main.handlers.get('synthesize-speech')(null, { text: '' }), /No text/);
});
