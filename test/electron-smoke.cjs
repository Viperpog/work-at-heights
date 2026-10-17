// Real Electron/DOM/IPC smoke test. External AI and native file dialogs are doubles.
// Run separately: npm run test:electron. Never uses the normal learner profile.
const { app, BrowserWindow, dialog, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Document, Packer, Paragraph } = require('docx');
const mammoth = require('mammoth');
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'wah-electron-test-'));
app.setPath('userData', path.join(temporary, 'profile'));
app.setAppPath(root);
const errors = [];
const resources = [];
const external = [];
let output = 'export.docx';
let passed = 0;
global.fetch = async () => { throw new Error('Synthetic offline service for fallback smoke test'); };
dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(temporary, output) });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(temporary, 'vr.docx')] });
shell.openExternal = async url => { external.push(url); };
app.on('web-contents-created', (_event, contents) => {
  contents.on('preload-error', (_event, _preload, error) => errors.push(String(error)));
  contents.on('render-process-gone', (_event, details) => errors.push(JSON.stringify(details)));
  contents.session.webRequest.onErrorOccurred(details => resources.push({ url: details.url, error: details.error }));
});
require('../src/main.js');

app.whenReady().then(async () => {
  const timeout = setTimeout(() => { console.error('FAIL Electron smoke timed out'); app.exit(1); }, 60000);
  const win = BrowserWindow.getAllWindows()[0];
  const js = code => win.webContents.executeJavaScript(code, true);
  const wait = async expression => {
    const deadline = Date.now() + 10000;
    while (!(await js(expression))) {
      if (Date.now() > deadline) throw new Error(`Timed out: ${expression}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  const check = (name, condition = true) => {
    assert.ok(condition, name);
    console.log(`PASS ${++passed}: ${name}`);
  };
  try {
    await new Promise(resolve => {
      if (!win.webContents.isLoading()) resolve();
      else win.webContents.once('did-finish-load', resolve);
    });
    await wait("typeof state !== 'undefined' && questionBank.length === 240 && finalQuizBank.length === 240 && document.querySelectorAll('.instructorCard').length > 0");
    await js("window.__smokeErrors=[]; window.addEventListener('error', e=>window.__smokeErrors.push(e.message)); window.addEventListener('unhandledrejection', e=>window.__smokeErrors.push(String(e.reason))); window.alert=()=>{}; window.confirm=()=>true; void 0");
    check('real main/preload/renderer initialize and both banks load');
    check('renderer receives learning settings only, without service configuration', await js("Object.keys(config).sort().join(',')==='maxTokens,useLocalFallbackWhenApiFails'"));
    check('all initial images load', await js("[...document.images].every(i=>i.complete && i.naturalWidth>0)"));
    await js("$('beginTrack').click(); $('studentName').value='Synthetic Learner'; $('studentEmail').value='smoke@example.invalid'; $('studentEmail').dispatchEvent(new Event('input')); $('openSmartChats').click(); $('completeLearning').click()");
    await wait('state.currentTab===2');
    check('orientation/navigation and SmartChats launch IPC', external.length === 1 && external[0].includes('smoke%40example.invalid'));
    await js(`{
      const transfer=new DataTransfer();
      transfer.items.add(new File(['email,question\\nsmoke@example.invalid,what is a harness'], 'synthetic.csv', {type:'text/csv'}));
      $('smartCsv').files=transfer.files; $('smartCsv').dispatchEvent(new Event('change'));
    }`);
    await wait('state.smartchatsCompleted');
    check('real CSV File import and classification', await js("state.expertiseAfterSmartChats==='Basic' && state.smartQuestionCount===1"));
    await js("$('completeSmart').click(); $('startInterview').click(); $('answerBox').value='Synthetic answer without safety keywords'");
    await js('config.useLocalFallbackWhenApiFails=false; handleAnswer(false)');
    check('failed interview request retains answer/question and reenables controls', await js("!$('submitAnswer').disabled && !$('skipAnswer').disabled && state.interview.history.length===0 && $('answerBox').value==='Synthetic answer without safety keywords'"));
    await js('config.useLocalFallbackWhenApiFails=true');
    await js('handleAnswer(false)');
    let count = 0;
    while (!(await js('state.interviewCompleted'))) {
      if (++count > 25) throw new Error('Interview failed to terminate');
      await js('handleAnswer(true)');
    }
    output = 'interview.docx';
    await js("$('exportInterview').click()");
    await wait("!$('unlockQuiz').disabled");
    check('interview fallback/skips finish and report exports', fs.existsSync(path.join(temporary, output)));
    await js("$('unlockQuiz').click(); $('startQuiz').click()");
    count = 0;
    while (!(await js('state.quizCompleted'))) {
      if (++count > 25) throw new Error('Quiz failed to terminate');
      await js("document.querySelector(`input[data-quiz-option][value='${state.quiz.activeQuestion.correctIndex}']`).checked=true; $('submitQuizAnswer').click(); $('nextQuizQuestion').click()");
    }
    check('adaptive quiz renders, scores, completes and includes Module 5 Expert', await js("state.expertiseAfterQuiz==='Expert' && state.quiz.module5ExpertEncountered"));
    output = 'quiz.docx';
    await js("$('exportQuiz').click()");
    await wait("!$('unlockVrAnalysis').disabled");
    await fs.promises.writeFile(path.join(temporary, 'vr.docx'), await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('VR readiness: Intermediate'), new Paragraph('Synthetic VR report for testing only.')] }] })));
    await js("$('unlockVrAnalysis').click()");
    await js('analyzeVrReport()');
    check('real DOCX IPC import and fallback VR analysis', await js("state.vrCompleted && state.vrExpertiseLevel==='Intermediate'"));
    await js("$('continueDebriefing').click(); $('startDebrief').click()");
    for (let i = 0; i < 4; i++) await js("$('debriefAnswerBox').value='Synthetic reflection'; submitDebriefingAnswer()");
    check('debrief fallback completes after four answers', await js('state.debriefingCompleted'));
    output = 'debrief.docx';
    await js("$('exportDebrief').click()");
    await wait("!$('continueCertificate').disabled");
    await js("$('continueCertificate').click()");
    output = 'certificate.docx';
    await js("$('downloadCertificate').click()");
    await wait('state.certificateDownloaded');
    for (const file of ['interview.docx', 'quiz.docx', 'debrief.docx', 'certificate.docx']) {
      assert.match((await mammoth.extractRawText({ path: path.join(temporary, file) })).value, /Synthetic Learner/);
    }
    check('all report/certificate files contain synthetic learner and readable Word text');
    await js('saveSession(); window.__smokeSaved=loadSavedSession(\'smoke@example.invalid\')');
    check('completed certificate flag is saved before restoration', await js('window.__smokeSaved.certificateDownloaded'));
    await js('resetProgramForRetake(); applySessionToState(window.__smokeSaved)');
    check('restoration rebuilds certificate stage and navigation', await js("state.currentTab===7 && !document.querySelector('[data-tab=\"7\"]').disabled"));
    // Let the existing delayed interview messages settle before checking errors.
    await new Promise(resolve => setTimeout(resolve, 300));
    check('no captured renderer/preload/process errors or failed resource requests', errors.length === 0 && resources.length === 0 && (await js('window.__smokeErrors.length')) === 0);
    await js('saveSession()');
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload(); });
    await wait('questionBank.length===240 && finalQuizBank.length===240');
    await js("applySessionToState(loadSavedSession('smoke@example.invalid'))");
    check('localStorage survives reload; existing restore policy resets certificateDownloaded', await js('state.currentTab===7 && state.debriefingCompleted && !state.certificateDownloaded'));
    console.log(`Electron smoke: ${passed} passed, 0 failed. AI/network and native dialogs mocked; no microphone test.`);
    console.log(`Temporary synthetic artifacts/profile: ${temporary}`);
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    clearTimeout(timeout);
    console.error(`Electron smoke: ${passed} passed, 1 failed. ${error.stack}`);
    console.error(JSON.stringify({ errors, resources }));
    console.error(`Temporary synthetic artifacts/profile: ${temporary}`);
    app.exit(1);
  }
});
