// Real learner renderer/preload/main; synthetic audio/devices, no live services.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
app.setAppPath(root); app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'wah-learner-mic-')));
const requests = [];
global.fetch = async (_url, options) => { requests.push(JSON.parse(options.body)); return Response.json({ text: '' }); };
app.on('web-contents-created', (_, contents) => contents.setBackgroundThrottling(false));
require('../src/main.js');
app.whenReady().then(async () => {
  let passed = 0; const timer = setTimeout(() => app.exit(1), 60000);
  const win = BrowserWindow.getAllWindows()[0]; const js = code => win.webContents.executeJavaScript(code, true);
  const check = (label, result) => { assert.ok(result, label); console.log(`PASS learner microphone ${++passed}: ${label}`); };
  const wait = async condition => { const until = Date.now() + 10000; while (!await js(condition)) { if (Date.now() > until) throw Error('Timed out: ' + condition); await new Promise(resolve => setTimeout(resolve, 40)); } };
  const fixture = async () => js(`window.__calls=[];window.__tracks=[];window.__contexts=[];window.__denied=false;window.__silent=false;
    window.__devices=[{kind:'audioinput',deviceId:'default',label:'Default — Oculus Virtual Audio Device'},{kind:'audioinput',deviceId:'headset',label:'TOZO T6'},{kind:'audioinput',deviceId:'usb',label:'USB microphone'}];
    navigator.mediaDevices.enumerateDevices=async()=>window.__devices;
    navigator.mediaDevices.getUserMedia=async constraints=>{
      window.__calls.push(constraints);if(window.__denied)throw new DOMException('Denied','NotAllowedError');
      if(constraints.audio?.deviceId?.exact && !window.__devices.some(d=>d.deviceId===constraints.audio.deviceId.exact))throw new DOMException('Gone','OverconstrainedError');
      const ctx=new AudioContext();await ctx.resume();window.__contexts.push(ctx);const dest=ctx.createMediaStreamDestination();const source=ctx.createOscillator();const gain=ctx.createGain();gain.gain.value=window.__silent?0:0.25;source.connect(gain);gain.connect(dest);source.start();
      const track=dest.stream.getAudioTracks()[0];Object.defineProperty(track,'label',{value:window.__devices.find(d=>d.deviceId===(constraints.audio?.deviceId?.exact||'default')).label});window.__tracks.push(track);return dest.stream;
    };refreshMicrophones();true`);
  const choose = async value => js(`document.getElementById('interviewMicrophone').value=${JSON.stringify(value)};document.getElementById('interviewMicrophone').dispatchEvent(new Event('change'));true`);
  try {
    await wait("microphoneState.ready && !!document.getElementById('interviewMicrophone')"); await fixture(); await wait('microphoneState.inputs.length===3');
    check('default microphone identified without a saved preference', await js("microphoneConstraints().audio===true && document.getElementById('interviewMicrophone').options[0].textContent.includes('Oculus')"));
    await choose('headset');
    check('explicit preference persists and both stages share it', await js("localStorage.getItem(microphonePreferenceKey)==='headset' && document.getElementById('debriefMicrophone').value==='headset' && microphoneConstraints().audio.deviceId.exact==='headset'"));
    win.webContents.reload(); await wait("microphoneState.ready && document.readyState==='complete'"); await fixture(); await wait('microphoneState.inputs.length===3');
    check('preference restores after actual renderer reload', await js("microphoneState.deviceId==='headset' && document.getElementById('interviewMicrophone').value==='headset'"));
    const beforeLocal = requests.length;
    await js('startLocalMicrophoneTest();true'); await wait('microphoneState.local?.peak>0'); await new Promise(resolve=>setTimeout(resolve,500));
    check('local test uses selected input and displays actual track label', await js("window.__calls.at(-1).audio.deviceId.exact==='headset' && document.getElementById('interviewMicrophoneActive').textContent.includes('TOZO T6')"));
    await js('stopLocalMicrophoneTest();true'); await wait('!!microphoneState.url && !microphoneState.local');
    check('local playback starts under unchanged CSP', await js("document.getElementById('interviewMicrophonePlayback').muted=true;document.getElementById('interviewMicrophonePlayback').play().then(()=>!document.getElementById('interviewMicrophonePlayback').paused)"));
    check('local test never calls Worker or submits assessment', requests.length===beforeLocal && await js("document.getElementById('answerBox').value==='' && document.getElementById('debriefAnswerBox').value===''") );
    await js('clearLocalMicrophoneTest();true'); check('discard releases streams, context and playback URL', await js("!microphoneState.url && !microphoneState.local && window.__tracks.every(t=>t.readyState==='ended') && !document.getElementById('interviewMicrophonePlayback').getAttribute('src')"));
    for (const mode of ['interview','debrief']) {
      await js(`voiceState.mode=${JSON.stringify(mode)};startVoiceRecording();true`); await wait('voiceState.recording && voiceState.speechDetected');
      check(mode + ' uses shared exact selection and active track label', await js("window.__calls.at(-1).audio.deviceId.exact==='headset' && document.getElementById('debriefMicrophoneActive').textContent.includes('TOZO T6')") );
      await js('stopVoiceRecording();true'); await wait('!voiceState.recording && !voiceState.transcribing');
    }
    check('service requests contain audio only, never device identifiers', requests.length===beforeLocal+2 && requests.every(r=>r.action==='transcribe' && !JSON.stringify(r).includes('headset') && !JSON.stringify(r).includes('TOZO')));
    await js("window.__devices=window.__devices.filter(d=>d.deviceId!=='headset');navigator.mediaDevices.dispatchEvent(new Event('devicechange'));true"); await wait("!microphoneState.inputs.some(d=>d.deviceId==='headset')");
    check('disconnected saved selection remains visible without fallback', await js("microphoneState.deviceId==='headset' && document.getElementById('interviewMicrophone').selectedOptions[0].textContent.includes('unavailable')"));
    const beforeMissing = requests.length; await js('startVoiceRecording();true'); await wait('!microphoneState.busy');
    check('missing input rejected with actionable message, no API call', requests.length===beforeMissing && await js("!voiceState.recording && document.getElementById('debriefVoiceStatus').textContent.includes('unavailable')"));
    await choose('usb'); await js('voiceState.mode="interview";startVoiceRecording();true'); await wait('voiceState.recording');
    await js("voiceState.mediaStream.getAudioTracks()[0].dispatchEvent(new Event('ended'));true"); await wait('!voiceState.recording && !voiceState.transcribing');
    check('physical track-ended cancels answer without transcription', requests.length===beforeMissing && await js("document.getElementById('voiceStatus').textContent.includes('disconnected')"));
    await js('window.__denied=true;startLocalMicrophoneTest();true'); await wait('!microphoneState.busy');
    check('permission denial handled in local test', await js("!microphoneState.local && document.getElementById('interviewMicrophoneStatus').textContent.includes('permission denied')"));
    await js('startVoiceRecording();true'); await wait('!microphoneState.busy'); check('normal permission denial restores answer controls',await js("!document.getElementById('submitAnswer').disabled && !document.getElementById('skipAnswer').disabled"));
    await js('window.__denied=false;window.__silent=true;startLocalMicrophoneTest();true'); await wait('!!microphoneState.local'); await new Promise(resolve=>setTimeout(resolve,500)); await js('stopLocalMicrophoneTest();true'); await wait('!microphoneState.local');
    check('silent local recording reports no input without API calls', requests.length===beforeMissing && await js("document.getElementById('interviewMicrophoneStatus').textContent.includes('No detectable')"));
    await js('window.__silent=false;startLocalMicrophoneTest();true'); await wait('!!microphoneState.local'); await js('setTab(1);true');
    check('navigation cancels test and releases tracks/context', await js("!microphoneState.local && !microphoneState.url && window.__tracks.every(t=>t.readyState==='ended')"));
    await js('startLocalMicrophoneTest();true');await wait('!!microphoneState.local');await js("microphoneState.local.stream.getAudioTracks()[0].dispatchEvent(new Event('ended'));true");
    check('local test disconnection cancels and reports without sending',requests.length===beforeMissing && await js("!microphoneState.local && document.getElementById('interviewMicrophoneStatus').textContent.includes('disconnected')"));
    await js("localStorage.setItem(microphonePreferenceKey,'removed-device');true");win.webContents.reload();await wait("microphoneState.ready && document.readyState==='complete'");await fixture();await wait('microphoneState.inputs.length===3');
    check('stale preference restores after reload as unavailable, never default',await js("microphoneState.deviceId==='removed-device' && microphoneConstraints().audio.deviceId.exact==='removed-device' && document.getElementById('debriefMicrophone').selectedOptions[0].textContent.includes('unavailable')"));
    await choose(''); check('choosing system default removes persisted ID', await js("!localStorage.getItem(microphonePreferenceKey) && microphoneConstraints().audio===true && document.getElementById('debriefMicrophone').value===''") );
    await js('startVoiceRecording();true'); await wait('voiceState.recording'); check('normal default input preserves original audio:true constraints', await js('window.__calls.at(-1).audio===true'));
    await js('voiceState.speechDetected=false;stopVoiceRecording();true'); await wait('!voiceState.transcribing');
    if(process.env.WAH_MICROPHONE_SCREENSHOT) {
      await js("document.getElementById('welcomePage').classList.add('hidden');document.getElementById('appShell').classList.remove('hidden');setTab(3);document.getElementById('interviewBox').classList.remove('hidden');document.getElementById('interviewIntro').classList.add('hidden');document.getElementById('interviewMicrophone').scrollIntoView({block:'center'});true");
      await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await js('Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})))');
      fs.writeFileSync(process.env.WAH_MICROPHONE_SCREENSHOT,(await win.webContents.capturePage()).toPNG());
    }
    await js('Promise.all(window.__contexts.map(ctx=>ctx.close().catch(()=>{})))');
    console.log(`Learner microphone: ${passed} passed, 0 failed. Synthetic devices/audio; provider mocked.`);clearTimeout(timer);app.exit(0);
  } catch (error) { console.error(error.stack || String(error));clearTimeout(timer);app.exit(1); }
});
