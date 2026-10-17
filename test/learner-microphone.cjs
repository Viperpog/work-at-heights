// Real learner renderer/preload/main; synthetic audio/devices, no live services.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
app.setAppPath(root); app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'wah-learner-mic-')));
const requests = [];
let transcript = '';
global.fetch = async (_url, options) => { const body=JSON.parse(options.body); requests.push(body); return body.action==='transcribe' ? Response.json({ text: transcript }) : Response.json({content:'Synthetic malformed AI response to exercise existing fallback'}); };
app.on('web-contents-created', (_, contents) => contents.setBackgroundThrottling(false));
require('../src/main.js');
app.whenReady().then(async () => {
  let passed = 0; const timer = setTimeout(() => app.exit(1), 60000);
  const win = BrowserWindow.getAllWindows()[0]; const js = code => win.webContents.executeJavaScript(code, true);
  const check = (label, result) => { assert.ok(result, label); console.log(`PASS learner microphone ${++passed}: ${label}`); };
  const wait = async condition => { const until = Date.now() + 10000; while (!await js(condition)) { if (Date.now() > until) throw Error('Timed out: ' + condition); await new Promise(resolve => setTimeout(resolve, 40)); } };
  const fixture = async () => js(`window.__calls=[];window.__tracks=[];window.__contexts=[];window.__gains=[];window.__maxTimers=[];window.__denied=false;window.__silent=false;
    window.__noSpeechTimers=[];window.__originalTimeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>{if(ms===120000||ms===180000)window.__maxTimers.push({fn,ms});if(ms===15000)window.__noSpeechTimers.push({fn,ms});return window.__originalTimeout(fn,ms,...args);};
    window.__devices=[{kind:'audioinput',deviceId:'default',label:'Default — Oculus Virtual Audio Device'},{kind:'audioinput',deviceId:'headset',label:'TOZO T6'},{kind:'audioinput',deviceId:'usb',label:'USB microphone'}];
    navigator.mediaDevices.enumerateDevices=async()=>window.__devices;
    navigator.mediaDevices.getUserMedia=async constraints=>{
      window.__calls.push(constraints);if(window.__denied)throw new DOMException('Denied','NotAllowedError');
      if(constraints.audio?.deviceId?.exact && !window.__devices.some(d=>d.deviceId===constraints.audio.deviceId.exact))throw new DOMException('Gone','OverconstrainedError');
      const ctx=new AudioContext();await ctx.resume();window.__contexts.push(ctx);const dest=ctx.createMediaStreamDestination();const source=ctx.createOscillator();const gain=ctx.createGain();window.__gains.push(gain);gain.gain.value=window.__silent?0:0.25;source.connect(gain);gain.connect(dest);source.start();
      const track=dest.stream.getAudioTracks()[0];Object.defineProperty(track,'label',{value:window.__devices.find(d=>d.deviceId===(constraints.audio?.deviceId?.exact||'default')).label});window.__tracks.push(track);return dest.stream;
    };refreshMicrophones();true`);
  const choose = async value => js(`document.getElementById('audioMicrophone').value=${JSON.stringify(value)};document.getElementById('audioMicrophone').dispatchEvent(new Event('change'));true`);
  try {
    await wait("microphoneState.ready && !!document.getElementById('audioMicrophone')"); await fixture(); await wait('microphoneState.inputs.length===3');
    await js("document.getElementById('welcomePage').classList.add('hidden');document.getElementById('appShell').classList.remove('hidden');document.getElementById('audioSettingsButton').click();true");
    check('global settings opens accessible modal with testing collapsed',await js("document.getElementById('audioSettings').open && document.getElementById('audioSettings').getAttribute('aria-labelledby')==='audioSettingsTitle' && !document.querySelector('#audioSettings details').open && !document.querySelector('#interviewBox .microphoneSettings') && !document.querySelector('#tab6 .microphoneSettings')"));
    check('header gear has requested colors and accessible name',await js("(()=>{const button=document.getElementById('audioSettingsButton'),style=getComputedStyle(button);return style.backgroundColor==='rgb(41, 64, 92)' && style.color==='rgb(255, 255, 255)' && button.getAttribute('aria-label')==='Audio settings';})()"));
    win.focus();win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait("!document.getElementById('audioSettings').open");
    await wait("document.activeElement===document.getElementById('audioSettingsButton')");
    check('Escape closes settings and restores keyboard focus',await js("document.activeElement===document.getElementById('audioSettingsButton')"));
    await js("window.__unexpectedCancellation=0;voiceState.currentAudio={pause:()=>window.__unexpectedCancellation++};window.__speechId=voiceState.speechRequestId;document.getElementById('audioSettingsButton').click();refreshVoiceControls();updateStatus();document.getElementById('closeAudioSettings').click();true");
    check('settings clicks and UI updates do not cancel or restart narration',await js('window.__unexpectedCancellation===0 && voiceState.speechRequestId===window.__speechId'));
    await js('voiceState.currentAudio=null;true');
    win.setSize(480,760);await js("document.getElementById('audioSettingsButton').click();true");
    check('settings panel fits narrow windows',await js("(()=>{const r=document.getElementById('audioSettings').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.height<=innerHeight;})()"));
    await js("document.getElementById('closeAudioSettings').click();true");win.setSize(1280,900);
    await js("document.querySelector('#audioSettings details').open=true;document.getElementById('audioMicrophoneRefresh').click();true");await wait('!microphoneState.busy');
    check('explicit permission refresh reveals names and releases capture without API calls',requests.length===0&&await js("window.__tracks.every(t=>t.readyState==='ended') && document.getElementById('audioMicrophone').options[0].textContent.includes('Oculus')"));
    await js("document.querySelector('#audioSettings details').open=false;true");
    check('default microphone identified without a saved preference', await js("microphoneConstraints().audio===true && document.getElementById('audioMicrophone').options[0].textContent.includes('Oculus')"));
    await choose('headset');
    check('explicit preference persists and both stages share it', await js("localStorage.getItem(microphonePreferenceKey)==='headset' && document.getElementById('audioMicrophone').value==='headset' && microphoneConstraints().audio.deviceId.exact==='headset'"));
    win.webContents.reload(); await wait("microphoneState.ready && document.readyState==='complete'"); await fixture(); await wait('microphoneState.inputs.length===3');
    check('preference restores after actual renderer reload', await js("microphoneState.deviceId==='headset' && document.getElementById('audioMicrophone').value==='headset'"));
    const beforeLocal = requests.length;
    await js('startLocalMicrophoneTest();true'); await wait('microphoneState.local?.peak>0'); await new Promise(resolve=>setTimeout(resolve,500));
    check('local test uses selected input and displays actual track label', await js("window.__calls.at(-1).audio.deviceId.exact==='headset' && document.getElementById('audioMicrophoneActive').textContent.includes('TOZO T6')"));
    await js('stopLocalMicrophoneTest();true'); await wait('!!microphoneState.url && !microphoneState.local');
    check('local playback starts under unchanged CSP', await js("document.getElementById('audioMicrophonePlayback').muted=true;document.getElementById('audioMicrophonePlayback').play().then(()=>!document.getElementById('audioMicrophonePlayback').paused)"));
    check('local test never calls Worker or submits assessment', requests.length===beforeLocal && await js("document.getElementById('answerBox').value==='' && document.getElementById('debriefAnswerBox').value===''") );
    await js('clearLocalMicrophoneTest();true'); check('discard releases streams, context and playback URL', await js("!microphoneState.url && !microphoneState.local && window.__tracks.every(t=>t.readyState==='ended') && !document.getElementById('audioMicrophonePlayback').getAttribute('src')"));
    for (const mode of ['interview','debrief']) {
      await js('window.__captureCanceledPlayback=false;voiceState.currentAudio={pause:()=>{window.__captureCanceledPlayback=true;}};true');
      await js(`voiceState.mode=${JSON.stringify(mode)};startVoiceRecording();true`); await wait('voiceState.recording && voiceState.speechDetected');
      const captureCalls=await js('window.__calls.length');await js('startVoiceRecording();true');
      check(mode+' rejects duplicate recording start',await js('window.__calls.length')===captureCalls);
      check(mode+' capture stops existing playback',await js('window.__captureCanceledPlayback && !voiceState.currentAudio'));
      check(mode + ' uses shared exact selection and active track label', await js("window.__calls.at(-1).audio.deviceId.exact==='headset' && document.getElementById('audioMicrophoneActive').textContent.includes('TOZO T6')") );
      await js('window.__gains.at(-1).gain.value=0;true');await new Promise(resolve=>setTimeout(resolve,2000));
      check(mode+' continues through a silent pause',await js('voiceState.recording && !voiceState.transcribing'));
      check(mode+' keeps maximum duration',await js('window.__maxTimers.at(-1).ms')===(mode==='debrief'?180000:120000));
      await js('toggleVoiceAnswer();startVoiceRecording();true'); await wait('!voiceState.recording && !voiceState.transcribing');
      check(mode+' rejects rapid restart while stopping/transcribing',await js('window.__calls.length')===captureCalls);
    }
    check('service requests contain audio only, never device identifiers', requests.length===beforeLocal+2 && requests.every(r=>r.action==='transcribe' && !JSON.stringify(r).includes('headset') && !JSON.stringify(r).includes('TOZO')));
    for(const mode of ['interview','debrief']) {
      const beforeMax=requests.length;await js(`voiceState.mode=${JSON.stringify(mode)};startVoiceRecording();true`);await wait('voiceState.recording && voiceState.speechDetected');
      await js('window.__maxTimers.at(-1).fn();true');await wait('!voiceState.recording && !voiceState.transcribing');
      check(mode+' maximum timer transcribes nonempty audio exactly once',requests.length===beforeMax+1);
    }
    await js("state.studentName='Synthetic Learner';state.studentEmail='audio@example.invalid';state.interview.activeQuestion=chooseQuestion(1,'basic');voiceState.enabled=false;true");
    transcript='Synthetic spoken safety answer';
    for(const mode of ['interview','debrief']) {
      const beforeAuto=requests.filter(r=>r.action==='transcribe').length;
      const beforeEvidence=await js(mode==='interview'?'state.interview.history.length':'state.debriefing.turn');
      await js(`document.getElementById(${JSON.stringify(mode==='interview'?'voiceAnswer':'debriefVoiceAnswer')}).click();true`);await wait('voiceState.recording && voiceState.speechDetected');
      check(mode+' one click starts capture and detects speech',await js('voiceState.recording && voiceState.speechDetected'));
      await js('window.__gains.at(-1).gain.value=0;true');await new Promise(resolve=>setTimeout(resolve,2000));
      check(mode+' one-press recording tolerates a two-second thinking pause',await js('voiceState.recording'));
      await js('window.__gains.at(-1).gain.value=0.25;true');await new Promise(resolve=>setTimeout(resolve,250));await js('window.__gains.at(-1).gain.value=0;true');
      await wait('!voiceState.recording && !voiceState.transcribing');
      check(mode+' sustained silence transcribes and processes answer exactly once',requests.filter(r=>r.action==='transcribe').length===beforeAuto+1 && await js(mode==='interview'?'state.interview.history.length':'state.debriefing.turn')===beforeEvidence+1);
      check(mode+' automatic completion releases tracks/timers without starting a new recording',await js('!voiceState.recording && !voiceState.mediaStream && !voiceState.audioContext && !voiceState.silenceCheckId && !voiceState.noSpeechTimer && !voiceState.maxRecordingTimer'));
    }
    transcript='';
    await js("window.__devices=window.__devices.filter(d=>d.deviceId!=='headset');navigator.mediaDevices.dispatchEvent(new Event('devicechange'));true"); await wait("!microphoneState.inputs.some(d=>d.deviceId==='headset')");
    check('disconnected saved selection remains visible without fallback', await js("microphoneState.deviceId==='headset' && document.getElementById('audioMicrophone').selectedOptions[0].textContent.includes('unavailable')"));
    const beforeMissing = requests.length; await js('startVoiceRecording();true'); await wait('!microphoneState.busy');
    check('missing input rejected with actionable message, no API call', requests.length===beforeMissing && await js("!voiceState.recording && document.getElementById('debriefVoiceStatus').textContent.includes('unavailable')"));
    await choose('usb'); await js('voiceState.mode="interview";startVoiceRecording();true'); await wait('voiceState.recording');
    await js("voiceState.mediaStream.getAudioTracks()[0].dispatchEvent(new Event('ended'));true"); await wait('!voiceState.recording && !voiceState.transcribing');
    check('physical track-ended cancels answer without transcription', requests.length===beforeMissing && await js("document.getElementById('voiceStatus').textContent.includes('disconnected')"));
    await js('window.__denied=true;startLocalMicrophoneTest();true'); await wait('!microphoneState.busy');
    check('permission denial handled in local test', await js("!microphoneState.local && document.getElementById('audioMicrophoneStatus').textContent.includes('permission denied')"));
    await js('startVoiceRecording();true'); await wait('!microphoneState.busy'); check('normal permission denial restores answer controls',await js("!document.getElementById('submitAnswer').disabled && !document.getElementById('skipAnswer').disabled"));
    await js('window.__denied=false;window.__silent=true;startLocalMicrophoneTest();true'); await wait('!!microphoneState.local'); await new Promise(resolve=>setTimeout(resolve,500)); await js('stopLocalMicrophoneTest();true'); await wait('!microphoneState.local');
    check('silent local recording reports no input without API calls', requests.length===beforeMissing && await js("document.getElementById('audioMicrophoneStatus').textContent.includes('No detectable')"));
    await js('window.__silent=false;startLocalMicrophoneTest();true'); await wait('!!microphoneState.local'); await js('setTab(1);true');
    check('navigation cancels test and releases tracks/context', await js("!microphoneState.local && !microphoneState.url && window.__tracks.every(t=>t.readyState==='ended')"));
    await js('startLocalMicrophoneTest();true');await wait('!!microphoneState.local');await js("microphoneState.local.stream.getAudioTracks()[0].dispatchEvent(new Event('ended'));true");
    check('local test disconnection cancels and reports without sending',requests.length===beforeMissing && await js("!microphoneState.local && document.getElementById('audioMicrophoneStatus').textContent.includes('disconnected')"));
    await js("localStorage.setItem(microphonePreferenceKey,'removed-device');true");win.webContents.reload();await wait("microphoneState.ready && document.readyState==='complete'");await fixture();await wait('microphoneState.inputs.length===3');
    check('stale preference restores after reload as unavailable, never default',await js("microphoneState.deviceId==='removed-device' && microphoneConstraints().audio.deviceId.exact==='removed-device' && document.getElementById('audioMicrophone').selectedOptions[0].textContent.includes('unavailable')"));
    await choose(''); check('choosing system default removes persisted ID', await js("!localStorage.getItem(microphonePreferenceKey) && microphoneConstraints().audio===true && document.getElementById('audioMicrophone').value===''") );
    await js('startVoiceRecording();true'); await wait('voiceState.recording'); check('normal default input preserves original audio:true constraints', await js('window.__calls.at(-1).audio===true'));
    await js('voiceState.speechDetected=false;stopVoiceRecording();true'); await wait('!voiceState.transcribing');
    const beforeEmpty=requests.length;await js('window.__silent=true;startVoiceRecording();true');await wait('voiceState.recording');await js('window.__maxTimers.at(-1).fn();true');await wait('!voiceState.recording && !voiceState.transcribing');
    check('maximum timer stops capture but never submits empty audio',requests.length===beforeEmpty&&await js("document.getElementById('voiceStatus').textContent.includes('No clear')"));
    await js('startVoiceRecording();true');await wait('voiceState.recording');await js('window.__noSpeechTimers.at(-1).fn();true');await wait('!voiceState.recording && !voiceState.transcribing');
    check('fifteen-second no-speech timer cancels without transcription',requests.length===beforeEmpty&&await js("document.getElementById('voiceStatus').textContent.includes('No speech detected') && window.__noSpeechTimers.at(-1).ms===15000"));
    for(const mode of ['interview','debrief']) {
      await js(`voiceState.mode=${JSON.stringify(mode)};voiceState.enabled=true;window.__silent=false;startVoiceRecording();true`);await wait('voiceState.recording && voiceState.speechDetected');
      await js(mode==='interview'?'toggleVoiceMode();true':'toggleDebriefVoiceMode();true');await wait('!voiceState.recording && !voiceState.transcribing');
      check(mode+' disabling voice cancels and discards without submitting',requests.length===beforeEmpty&&await js('window.__tracks.every(t=>t.readyState===\'ended\')'));
    }
    await js('window.__originalGetUserMedia=navigator.mediaDevices.getUserMedia;navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await window.__originalGetUserMedia(constraints);return new Promise(resolve=>{window.__releaseCapture=()=>resolve(stream);});};startVoiceRecording();true');await wait('!!window.__releaseCapture');
    await js('setTab(1);window.__releaseCapture();true');await wait('!microphoneState.busy');
    check('navigation cancels pending capture acquisition and releases its tracks',requests.length===beforeEmpty&&await js("!voiceState.recording && window.__tracks.every(t=>t.readyState==='ended')"));
    await js('navigator.mediaDevices.getUserMedia=window.__originalGetUserMedia;true');
    if(process.env.WAH_MICROPHONE_SCREENSHOT) {
      await js("document.getElementById('welcomePage').classList.add('hidden');document.getElementById('appShell').classList.remove('hidden');setTab(3);document.getElementById('audioSettingsButton').click();true");
      await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await js('Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})))');
      fs.writeFileSync(process.env.WAH_MICROPHONE_SCREENSHOT,(await win.webContents.capturePage()).toPNG());
    }
    await js('Promise.all(window.__contexts.map(ctx=>ctx.close().catch(()=>{})))');
    console.log(`Learner microphone: ${passed} passed, 0 failed. Synthetic devices/audio; provider mocked.`);clearTimeout(timer);app.exit(0);
  } catch (error) { console.error(error.stack || String(error));clearTimeout(timer);app.exit(1); }
});
