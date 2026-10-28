// Real Electron/DOM/IPC smoke test. External AI and native file dialogs are doubles.
// Run separately: npm run test:electron. Never uses the normal learner profile.
const { app, BrowserWindow, dialog, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Document, Packer, Paragraph } = require('docx');
const mammoth = require('mammoth');
// Optionally exercise the exact packaged archive, with the same isolated profile.
const root = process.env.WAH_PACKAGED_APP || path.resolve(__dirname, '..');
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
  // Keep synthetic-media timers deterministic when the test window is occluded.
  contents.setBackgroundThrottling(false);
  contents.on('preload-error', (_event, _preload, error) => errors.push(String(error)));
  contents.on('render-process-gone', (_event, details) => errors.push(JSON.stringify(details)));
  contents.session.webRequest.onErrorOccurred(details => resources.push({ url: details.url, error: details.error }));
});
require(path.join(root, 'src/main.js'));

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
  const waitForExport = async file => {
    const deadline = Date.now() + 10000;
    while (!fs.existsSync(path.join(temporary, file))) {
      if (Date.now() > deadline) throw new Error(`Timed out waiting for export: ${file}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  try {
    await new Promise(resolve => {
      if (!win.webContents.isLoading()) resolve();
      else win.webContents.once('did-finish-load', resolve);
    });
    await wait("typeof state !== 'undefined' && questionBank.length === 240 && finalQuizBank.length === 240 && document.querySelectorAll('.instructorCard').length > 0");
    await require('./dialog-test-helpers.cjs').acceptNotices(win.webContents);
    await js("window.__smokeErrors=[]; window.addEventListener('error', e=>window.__smokeErrors.push(e.message)); window.addEventListener('unhandledrejection', e=>window.__smokeErrors.push(String(e.reason))); void 0");
    check('real main/preload/renderer initialize and both banks load');
    check('renderer receives learning settings only, without service configuration', await js("Object.keys(config).sort().join(',')==='maxTokens,useLocalFallbackWhenApiFails'"));
    await wait('[...document.images].every(i=>i.complete)');
    check('all initial images load', await js("[...document.images].every(i=>i.complete && i.naturalWidth>0)"));
    for (const [id, stem, voice] of [
      ['jake', 'jake-miller', 'cedar'], ['emily', 'emily-carter', 'sage'],
      ['carlos', 'carlos-rivera', 'onyx'], ['beatrice', 'beatrice-johnson', 'shimmer']
    ]) {
      await js(`openInstructorModal(); document.querySelector('#instructorModalChoices [data-instructor-id="${id}"]').click()`);
      await wait('[...document.images].every(i=>i.complete)');
      check(`${id} PNG loads in cards/modal and both headers with unchanged persona/voice`, await js(`(() => {
        const instructor=getSelectedInstructor();
        const images=[...document.querySelectorAll('[data-instructor-id="${id}"] img'), $('selectedInstructorImage'), $('selectedDebriefInstructorImage')];
        return instructor.id==='${id}' && instructor.voice==='${voice}'
          && images.length===document.querySelectorAll('.instructorChoices').length+2
          && images.every(image=>image.src.endsWith('/${stem}.png') && image.naturalWidth>0 && image.naturalHeight>0 && image.alt==='Portrait of '+instructor.name)
          && $('selectedInstructorName').textContent===instructor.name
          && $('selectedDebriefInstructorName').textContent===instructor.name
          && $('instructorModal').classList.contains('hidden');
      })()`));
    }
    await js("selectInstructor('jake')");
    await js("$('beginTrack').click(); $('studentName').value='Synthetic Learner'; $('studentEmail').value='smoke@example.invalid'; $('studentEmail').dispatchEvent(new Event('input'))");
    // Let the existing 250ms saved-session lookup finish before this synthetic
    // learner creates a new session; otherwise it can resume its own rapid run.
    await js('new Promise(resolve=>setTimeout(resolve,300))');
    await js("$('openSmartChats').click(); $('completeLearning').click()");
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
    await waitForExport(output);
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
    await waitForExport(output);
    await wait("!$('unlockVrAnalysis').disabled");
    await fs.promises.writeFile(path.join(temporary, 'vr.docx'), await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('VR readiness: Intermediate'), new Paragraph('Synthetic VR report for testing only.')] }] })));
    await js("$('unlockVrAnalysis').click()");
    await js('analyzeVrReport()');
    check('real DOCX IPC import and fallback VR analysis', await js("state.vrCompleted && state.vrExpertiseLevel==='Intermediate'"));
    check('presence questionnaire gates the debriefing', await js("$('continueDebriefing').disabled"));
    await js("[5,5,5,5,5,5].forEach((v, i) => pickChoice('presence', i, v)); submitPresence()");
    await wait("state.presence && !$('continueDebriefing').disabled");
    await js("$('continueDebriefing').click(); $('startDebrief').click()");
    for (let i = 0; i < 4; i++) await js("$('debriefAnswerBox').value='Synthetic reflection'; submitDebriefingAnswer()");
    check('debrief fallback completes after four answers', await js('state.debriefingCompleted'));
    output = 'debrief.docx';
    await js("$('exportDebrief').click()");
    await waitForExport(output);
    await wait("!$('continueCertificate').disabled");
    await js("$('continueCertificate').click()");
    output = 'certificate.pdf';
    await js("$('downloadCertificate').click()");
    await wait('state.certificateDownloaded');
    for (const file of ['interview.docx', 'quiz.docx', 'debrief.docx']) {
      assert.match((await mammoth.extractRawText({ path: path.join(temporary, file) })).value, /Synthetic Learner/);
    }
    check('all DOCX report files contain synthetic learner and readable Word text');
    check('certificate export is PDF rather than Word', fs.readFileSync(path.join(temporary, 'certificate.pdf')).subarray(0,5).toString()==='%PDF-');
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
    const savedCertificate = fs.readFileSync(path.join(temporary, 'certificate.pdf'));
    const certificateDenied = await js(`(async () => {
      const forged=JSON.parse(JSON.stringify(state)); forged.debriefingCompleted=false;
      try { await window.appApi.saveCertificate(forged); return false; } catch (_) { return true; }
    })()`);
    check('actual certificate IPC rejects incomplete evidence without replacing the export', certificateDenied && fs.readFileSync(path.join(temporary, 'certificate.pdf')).equals(savedCertificate));
    check('actual IPC rejects malicious external URL', await js("window.appApi.openExternal('javascript:alert(1)').then(()=>false,()=>true)"));
    check('actual IPC rejects file traversal', await js("window.appApi.readJson('../package.json').then(()=>false,()=>true)"));
    const injectionSafe = await js(`{
      window.__injected=0;
      window.__attack='<img src=x onerror="window.__injected=1"><script>window.__injected=1</script>';
      state.debriefing.vrSummary=window.__attack; state.smartSummary=window.__attack;
      renderVrStatus(); renderSmartResults();
      document.getElementById('vrReportStatus').textContent.includes(window.__attack)
        && document.getElementById('smartResults').textContent.includes(window.__attack)
        && !document.querySelector('#vrReportStatus img, #vrReportStatus script, #smartResults img, #smartResults script');
    }`);
    check('hostile report/session markup remains literal text in real DOM', injectionSafe);
    check('CSP rejects an actual inline script', await js(`(async()=>{
      window.__inlineExecuted=0;
      const element=document.createElement('script');element.textContent='window.__inlineExecuted=1';document.body.appendChild(element);
      await new Promise(resolve=>setTimeout(resolve,50));element.remove();
      return window.__inlineExecuted===0 && window.__injected===0;
    })()`));
    await js(`window.__networkViolation=false; document.addEventListener('securitypolicyviolation', e=>{
      if(e.effectiveDirective==='connect-src')window.__networkViolation=true;
    }); fetch('https://example.invalid/private').catch(()=>{}); true`);
    await wait('window.__networkViolation');
    check('CSP blocks renderer network connections');
    await js(`window.__audioResult=null; window.__audioError=null; (async()=>{
      // A short silent PCM WAV verifies blob media without relying on host capture devices.
      const bytes=new Uint8Array(1644), view=new DataView(bytes.buffer);
      const label=(offset,text)=>[...text].forEach((c,i)=>{bytes[offset+i]=c.charCodeAt(0);});
      label(0,'RIFF');view.setUint32(4,1636,true);label(8,'WAVE');label(12,'fmt ');
      view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
      view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);
      view.setUint16(34,16,true);label(36,'data');view.setUint32(40,1600,true);
      const blob=new Blob([bytes],{type:'audio/wav'});const url=URL.createObjectURL(blob);const audio=new Audio(url);
      try {
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Audio metadata timeout')),3000);
          audio.onloadeddata=()=>{clearTimeout(timer);resolve();};audio.onerror=()=>{clearTimeout(timer);reject(new Error('Audio failed'));};audio.load();});
        return blob.size>0 && audio.readyState>=2;
      } finally {audio.pause();URL.revokeObjectURL(url);}
    })().then(result=>{window.__audioResult=result;},error=>{window.__audioError=String(error);}); true`);
    await wait('window.__audioResult!==null || window.__audioError!==null');
    check('synthetic blob audio loading works under CSP', await js('window.__audioResult===true'));
    console.log(`Electron smoke: ${passed} passed, 0 failed. AI/network and native dialogs mocked; synthetic blob audio only, no microphone or audible playback.`);
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
