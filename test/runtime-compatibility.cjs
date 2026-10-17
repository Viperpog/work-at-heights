// Device-free real-runtime checks. Providers/dialogs are doubles, never real accounts.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'wah-runtime-test-'));
const profile = path.join(temporary, 'profile');
// Optional: clone a CLOSED synthetic Electron 31 smoke profile, never modify its source.
if (process.env.WAH_LEGACY_PROFILE) fs.cpSync(process.env.WAH_LEGACY_PROFILE, profile, { recursive: true });
app.setPath('userData', profile);
app.setAppPath(root);
const requests = [];
global.fetch = async (_url, options) => {
  const body = JSON.parse(options.body);
  requests.push(body);
  if (body.action === 'transcribe') return Response.json({ text: 'Synthetic recorded answer' });
  // Header-only provider double tests transport, not decoding a real TTS response.
  if (body.action === 'tts') return Response.json({ audioBase64: 'SUQz', mimeType: 'audio/mpeg' });
  throw new Error('Synthetic offline chat');
};
dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(temporary, 'restored.docx') });
app.on('web-contents-created', (_event, contents) => contents.setBackgroundThrottling(false));
require('../src/main.js');
app.whenReady().then(async () => {
  let passed = 0;
  const timeout = setTimeout(() => { console.error('Runtime checks timed out'); app.exit(1); }, 30000);
  const win = BrowserWindow.getAllWindows()[0];
  const js = code => win.webContents.executeJavaScript(code, true);
  const check = (name, result) => { assert.ok(result, name); console.log(`PASS runtime ${++passed}: ${name}`); };
  const wait = async expression => {
    const deadline = Date.now() + 10000;
    while (!(await js(expression))) {
      if (Date.now() > deadline) throw new Error('Runtime operation did not finish: ' + expression);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  try {
    await wait("typeof questionBank!=='undefined' && questionBank.length===240 && finalQuizBank.length===240");
    check('pinned Electron actually runs with isolated sandboxed preload',
      process.versions.electron === require('../package.json').devDependencies.electron
      && win.webContents.getLastWebPreferences().sandbox
      && win.webContents.getLastWebPreferences().contextIsolation
      && await js("typeof require==='undefined' && typeof process==='undefined' && Object.isFrozen(window.appApi)"));
    console.log(JSON.stringify({ electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node }));
    if (process.env.WAH_LEGACY_PROFILE) {
      await js("window.alert=()=>{}; window.confirm=()=>true; window.__legacy=loadSavedSession('smoke@example.invalid'); true");
      check('Electron 31 synthetic localStorage profile survives runtime upgrade', await js("window.__legacy?.studentName==='Synthetic Learner' && window.__legacy.quizCompleted && window.__legacy.debriefingCompleted"));
      await js('applySessionToState(window.__legacy); true');
      await js('window.appApi.saveCertificate(state)');
      check('upgraded restored evidence still exports a certificate', fs.statSync(path.join(temporary, 'restored.docx')).size > 0);
      check('upgraded profile cannot bypass certificate validation', await js("window.appApi.saveCertificate({...state,quizCompleted:false}).then(()=>false,()=>true)"));
    }
    await js(`window.__recorded=null; window.__mediaError=null; (async()=>{
      const context=new AudioContext(); const source=context.createOscillator();
      const destination=context.createMediaStreamDestination(); source.connect(destination);
      const recorder=new MediaRecorder(destination.stream,{mimeType:getSupportedAudioMimeType()});
      const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      try {
        await context.resume();source.start();
        const stopped=new Promise(resolve=>{recorder.onstop=resolve;});
        recorder.start();await new Promise(resolve=>setTimeout(resolve,200));recorder.stop();await stopped;
        const blob=new Blob(chunks,{type:recorder.mimeType});
        const audioBase64=await blobToBase64(blob);
        const response=await window.appApi.transcribeAudio({audioBase64,mimeType:blob.type,fileName:'synthetic.webm'});
        window.__recorded={size:blob.size,mime:blob.type,text:response.text};
      } finally {source.stop();destination.stream.getTracks().forEach(t=>t.stop());await context.close();}
    })().catch(error=>{window.__mediaError=String(error);}); true`);
    await wait('window.__recorded!==null || window.__mediaError!==null');
    check('real MediaRecorder and FileReader hand audio through preload/main to mocked transcription',
      await js("window.__recorded?.size>0 && window.__recorded.text==='Synthetic recorded answer'")
      && requests.some(r => r.action === 'transcribe' && r.audioBase64.length > 0 && /^audio\//.test(r.mimeType)));
    const speech = await js("window.appApi.synthesizeSpeech({text:'Synthetic safety guidance',voice:'cedar',model:'gpt-4o-mini-tts'})");
    check('speech synthesis IPC contract remains compatible', speech.audioBase64 === 'SUQz'
      && requests.some(r => r.action === 'tts' && r.text === 'Synthetic safety guidance'));
    await js(`window.__cancelled=null; (async()=>{
      // Silent WAV; no device recording, real voice or audible speaker output.
      const bytes=new Uint8Array(16044),view=new DataView(bytes.buffer);
      const label=(offset,text)=>[...text].forEach((c,i)=>{bytes[offset+i]=c.charCodeAt(0);});
      label(0,'RIFF');view.setUint32(4,16036,true);label(8,'WAVE');label(12,'fmt ');
      view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
      view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);
      view.setUint16(34,16,true);label(36,'data');view.setUint32(40,16000,true);
      const url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));const audio=new Audio(url);audio.muted=true;
      try {
        voiceState.currentAudio=audio;voiceState.currentAudioUrl=url;
        await audio.play();const played=!audio.paused;cancelInterviewerSpeech();
        window.__cancelled=played && audio.paused && voiceState.currentAudio===null && voiceState.currentAudioUrl===null;
      } finally {audio.pause();URL.revokeObjectURL(url);}
    })().catch(error=>{window.__mediaError=String(error);}); true`);
    await wait('window.__cancelled!==null || window.__mediaError!==null');
    check('actual muted blob playback starts and application cancellation releases audio', await js('window.__cancelled===true'));
    clearTimeout(timeout);
    console.log(`Runtime compatibility: ${passed} passed, 0 failed; synthetic media only, providers/dialogs mocked. Profile: ${temporary}`);
    app.exit(0);
  } catch (error) {
    clearTimeout(timeout);
    console.error(`Runtime compatibility: ${passed} passed, 1 failed. ${error.stack}`);
    console.error('Renderer media diagnostic:', await js('window.__mediaError || null').catch(() => null));
    app.exit(1);
  }
});
