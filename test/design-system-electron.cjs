// Actual Electron renderer verification. No real learner data or live providers.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = process.env.WAH_PACKAGED_APP || path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wah-design-v2-'));
const output = process.env.WAH_VISUAL_OUTPUT;
app.disableHardwareAcceleration();
app.setAppPath(root);
app.setPath('userData', path.join(profile, 'profile'));
global.fetch = async () => { throw new Error('Synthetic offline provider'); };
dialog.showSaveDialog = async () => ({ canceled: true });
dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
const failures = [];
app.on('web-contents-created', (_, contents) => {
  contents.setBackgroundThrottling(false);
  contents.session.webRequest.onErrorOccurred(details => failures.push(details.url));
});
require(path.join(root, 'src/main.js'));
app.whenReady().then(async () => {
  const timeout = setTimeout(() => { console.error('Design checks timed out'); app.exit(1); }, 90000);
  let passed = 0;
  const win = BrowserWindow.getAllWindows()[0];
  win.webContents.on('console-message', (_event, details) => { if(details.level==='error') console.error(details.message); });
  const js = code => win.webContents.executeJavaScript(code, true);
  const wait = async expression => {
    const until = Date.now() + 10000;
    while (!await js(expression)) {
      if (Date.now() > until) throw new Error('Timed out: ' + expression);
      await new Promise(resolve => setTimeout(resolve, 40));
    }
  };
  const check = (label, value) => { assert.ok(value, label); console.log(`PASS design ${++passed}: ${label}`); };
  const capture = async name => {
    await js('document.fonts.ready.then(()=>true)');
    await wait('[...document.images].every(image=>image.complete && image.naturalWidth>0)');
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    if (output) {
      fs.mkdirSync(output, { recursive: true });
      const png = await win.webContents.capturePage();
      assert.ok(!png.isEmpty(), 'Actual renderer screenshot must not be empty');
      fs.writeFileSync(path.join(output, name + '.png'), png.toPNG());
    }
  };
  try {
    win.setContentSize(1440, 900);
    win.show();
    await wait("typeof state!=='undefined' && questionBank.length===240 && document.querySelectorAll('.instructorCard').length===12");
    await js('document.fonts.ready.then(()=>true)');
    check('offline bundled Inter loads', await js("document.fonts.check('16px Inter')"));
    check('all document identifiers remain unique', await js("(()=>{const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);return ids.length===new Set(ids).size;})()"));
    await capture('00-welcome');
    await require('./dialog-test-helpers.cjs').acceptNotices(win.webContents);
    await js("window.__lookupDone=false;window.__originalLookup=checkForSavedSessionAfterEmailEntry;checkForSavedSessionAfterEmailEntry=async()=>{try{return await window.__originalLookup();}finally{window.__lookupDone=true;}};$('beginTrack').click(); $('studentName').value='Synthetic Learner'; $('studentEmail').value='design@example.invalid'; refreshTab1(); true");
    await wait('window.__lookupDone');
    check('existing orientation controls and sidebar navigation remain wired', await js("!$('openSmartChats').disabled && !document.querySelector('.status .tabs [data-tab=\"1\"]').disabled && $('statusName').textContent==='Synthetic Learner'"));
    await capture('01-orientation');
    // Visual fixtures explicitly unlock views. Full workflow/evidence/export is
    // independently exercised by electron-smoke.cjs, not inferred from fixtures.
    await js('for(let tab=2;tab<=7;tab++) unlock(tab); setTab(2)');
    await capture('02-smartchats-empty');
    await js(`window.__parse=Papa.parse;Papa.parse=(_file,options)=>{window.__csvError=options.error;};
      const transfer=new DataTransfer();transfer.items.add(new File(['synthetic'], 'synthetic.csv',{type:'text/csv'}));
      $('smartCsv').files=transfer.files;$('smartCsv').dispatchEvent(new Event('change'));true`);
    check('CSV reading shows actual busy status before completion', await js("$('smartResults').getAttribute('aria-busy')==='true' && $('smartResults').textContent.includes('Importing')"));
    await capture('02a-smartchats-loading');
    await js('window.__csvError();Papa.parse=window.__parse;true');
    check('CSV read error is visible without awarding completion', await js("$('smartResults').textContent.includes('Unable to read') && !state.smartchatsCompleted && $('completeSmart').disabled && !$('smartResults').hasAttribute('aria-busy')"));
    await capture('02b-smartchats-error');
    await js(`{const transfer=new DataTransfer();transfer.items.add(new File(['email,question\\ndesign@example.invalid,what is a harness\\ndesign@example.invalid,how is wind assessed\\ndesign@example.invalid,inspect equipment'], 'synthetic.csv',{type:'text/csv'}));$('smartCsv').files=transfer.files;$('smartCsv').dispatchEvent(new Event('change'));}`);
    await wait('state.smartchatsCompleted');
    check('SmartChats metrics use state rather than Figma sample values', await js("$('smartCountDisplay').textContent==='3' && $('smartLevelDisplay').textContent==='Intermediate'"));
    await capture('02-smartchats-results');
    await js('setTab(3)');
    await capture('03-instructor-selection');
    for (const [id, voice] of [['jake','cedar'],['emily','sage'],['carlos','onyx'],['beatrice','shimmer']]) {
      await js(`selectInstructor('${id}')`);
      check(id + ' retains persona/voice and accessible portrait', await js(`getSelectedInstructor().id==='${id}' && getSelectedInstructor().voice==='${voice}' && $('selectedInstructorImage').alt==='Portrait of '+getSelectedInstructor().name`));
    }
    await js("Math.random=()=>0;selectInstructor('jake');$('startInterview').click();true");
    await wait("$('chatLog').textContent.length>0");
    check('interview exposes all original text, skip, microphone and voice controls', await js("['answerBox','submitAnswer','skipAnswer','voiceAnswer','toggleVoiceMode','muteInterviewer','changeInstructorAvatar'].every(id=>!!$(id))"));
    await capture('04-interview');
    await js("window.__originalSpeak=speakInterviewer;speakInterviewer=async()=>{};$('toggleVoiceMode').click();true");
    check('voice enable exposes actual mute control without changing microphone entry point', await js("voiceState.enabled && !$('muteInterviewer').classList.contains('hidden') && !$('voiceAnswer').disabled"));
    await capture('04a-interview-voice');
    await js("$('muteInterviewer').click();true");
    check('mute toggles actual state and accessible action label', await js("voiceState.muted && $('muteInterviewer').textContent.includes('Unmute')"));
    await js("$('toggleVoiceMode').click();speakInterviewer=window.__originalSpeak;true");
    await js('handleAnswer(true)');
    check('interview module/difficulty presentation follows actual progression', await js("Number($('interviewStageProgress').value)===state.interview.currentModule && $('interviewDifficultyDisplay').textContent===levelLabels[state.interview.currentLevel]"));
    await capture('04b-interview-feedback');
    await js("setTab(4);$('startQuiz').click();true");
    await capture('05-quiz-question');
    await js("document.querySelectorAll('input[data-quiz-option]')[(state.quiz.activeQuestion.correctIndex+1)%state.quiz.activeQuestion.options.length].checked=true;submitQuizAnswer()");
    check('quiz review marks actual selected/correct answers and keeps bank explanation', await js("document.querySelector('.correctAnswer input').value===String(state.quiz.activeQuestion.correctIndex) && document.querySelector('.incorrectAnswer input').checked && $('quizFeedback').textContent.includes(state.quiz.activeQuestion.explanation) && !$('nextQuizQuestion').classList.contains('hidden')"));
    await capture('05a-quiz-incorrect');
    await js('continueQuiz()');
    await js("document.querySelectorAll('input[data-quiz-option]')[state.quiz.activeQuestion.correctIndex].checked=true;submitQuizAnswer()");
    check('correct quiz review identifies both selected and correct without an incorrect marker', await js("document.querySelectorAll('.correctAnswer').length===1 && !document.querySelector('.incorrectAnswer') && document.querySelector('.answerStatus').textContent==='Your answer · Correct answer'"));
    await capture('05b-quiz-correct');
    await js('setTab(5)');
    await capture('06-vr-import');
    await js("state.vrCompleted=true;state.vrExpertiseLevel='Intermediate';state.debriefing.vrReportFileName='synthetic-vr.docx';state.debriefing.vrSummary='Synthetic VR report analysis for visual verification.';renderVrStatus();$('continueDebriefing').disabled=false");
    await capture('06a-vr-results');
    await js("setTab(6);$('startDebrief').disabled=false");
    await capture('07-facilitator-selection');
    await js('startDebriefing()');
    await wait("$('debriefLog').textContent.length>0");
    await capture('08-debriefing');
    await js("window.__originalSpeak=speakInterviewer;speakInterviewer=async()=>{};$('toggleDebriefVoiceMode').click();true");
    check('debrief voice enable retains actual facilitator mute action', await js("voiceState.enabled && !$('muteDebriefFacilitator').classList.contains('hidden')"));
    await capture('08a-debriefing-voice');
    await js("$('toggleDebriefVoiceMode').click();speakInterviewer=window.__originalSpeak;true");
    const completed = require('./helpers.cjs').completedState('Basic');
    await js(`Object.assign(state,${JSON.stringify(completed)});setTab(7)`);
    check('certificate preview uses actual state and readiness calculation', await js("$('certStudentName').textContent===state.studentName && $('certEmail').textContent===state.studentEmail && $('certOverallBadge').textContent===calculateOverallReadiness() && typeof window.appApi.saveCertificate==='function'"));
    await capture('09-certificate');
    for (const width of [1440, 1024, 760, 480]) {
      win.setContentSize(width, 900);
      for (let tab=1; tab<=7; tab++) {
        await js(`setTab(${tab})`);
        check(`stage ${tab} fits ${width}px without document overflow`, await js('document.documentElement.scrollWidth<=innerWidth'));
      }
      if (width===480) {
        await js("setTab(3);openInstructorModal()");
        check('instructor modal fits narrow viewport', await js("document.querySelector('.modalCard').getBoundingClientRect().right<=innerWidth"));
        await capture('10-narrow-modal');
        await js("closeInstructorModal();$('audioSettingsButton').click()");
        check('microphone settings still open and fit narrow viewport', await js("$('audioSettings').open && $('audioSettings').getBoundingClientRect().right<=innerWidth"));
        await capture('11-audio-settings');
        await js("$('closeAudioSettings').click()");
      }
    }
    win.setContentSize(1440, 900);
    await js(`applySessionToState(${JSON.stringify(completed)});true`);
    for (const [tab, name, id] of [[3,'12-interview-complete','exportInterview'],[4,'13-quiz-complete','exportQuiz'],[6,'14-debrief-complete','exportDebrief']]) {
      await js(`setTab(${tab})`);
      check(name + ' retains its original report action', await js(`!$('${id}').disabled && $('${id}').getBoundingClientRect().width>0`));
      await capture(name);
    }
    check('all local image/font resources pass security allowlist without failed requests', failures.length===0);
    console.log(`Design integration: ${passed} passed, 0 failed. Synthetic fixtures/providers; screenshots ${output || 'not requested'}.`);
    clearTimeout(timeout); app.exit(0);
  } catch(error) { console.error(error.stack); console.error({ failures }); clearTimeout(timeout); app.exit(1); }
});
