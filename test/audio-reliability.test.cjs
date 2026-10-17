const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderer } = require('./helpers.cjs');
function playbackFixture() {
  const requests = [], audio = [], logs = [], revoked = [];
  const h = renderer({ synthesizeSpeech: () => new Promise((resolve,reject) => requests.push({resolve,reject})) });
  h.context.performance = performance; h.context.console.info = (...args) => logs.push(args);
  h.context.Blob = Blob; h.context.atob = atob;
  h.context.URL = { createObjectURL: () => 'blob:synthetic-' + audio.length, revokeObjectURL: value => revoked.push(value) };
  h.context.Audio = class {
    constructor() { this.paused=true;this.currentTime=0;this.duration=2;audio.push(this); }
    async play() { this.paused=false;this.onplay?.(); }
    pause() { this.paused=true;this.onpause?.(); }
  };
  h.run("config={audioDiagnostics:true};voiceState.enabled=true;voiceState.supportedNaturalSpeech=true");
  return {h,requests,audio,logs,revoked};
}
const tick = () => new Promise(resolve=>setImmediate(resolve));
const speech = {audioBase64:'AAAA',mimeType:'audio/mpeg'};
test('repeated active prompts coalesce; obsolete synthesis cannot interrupt current audio/status', async()=>{
  const {h,requests,audio,logs}=playbackFixture();
  const old=h.run("speakInterviewer('private old sentence')");
  await h.run("speakInterviewer('private old sentence')");assert.equal(requests.length,1);
  const current=h.run("speakInterviewer('private new sentence')");assert.equal(requests.length,2);
  requests[1].resolve(speech);await tick();assert.equal(audio.length,1);assert.equal(audio[0].paused,false);
  requests[0].resolve(speech);await old;assert.equal(audio.length,1);assert.match(h.element('voiceStatus').textContent,/speaking/);
  h.run('refreshVoiceControls()');assert.equal(audio[0].paused,false);assert.equal(requests.length,2);
  audio[0].onended();await current;assert.equal(h.run('voiceState.audioPhase'),'idle');
  assert.ok(logs.some(row=>JSON.stringify(row).includes('repeated synthesis suppressed')));
  assert.ok(!JSON.stringify(logs).includes('private'));
});
test('new prompt and explicit cancellation settle old playback and release blob URLs',async()=>{
  const {h,requests,audio,revoked}=playbackFixture();
  const first=h.run("speakInterviewer('one')");requests[0].resolve(speech);await tick();
  const second=h.run("speakInterviewer('two')");await first;assert.equal(audio[0].paused,true);assert.equal(revoked.length,1);
  requests[1].resolve(speech);await tick();assert.equal(audio.filter(item=>!item.paused).length,1);
  h.run("cancelInterviewerSpeech('test cancellation')");await second;assert.equal(audio[1].paused,true);assert.equal(revoked.length,2);
  assert.equal(h.run('voiceState.currentAudio'),null);assert.equal(h.run('voiceState.finishPlayback'),null);
});
test('obsolete synthesis failures do not start fallback or overwrite current status',async()=>{
  const {h,requests,audio}=playbackFixture();const first=h.run("speakInterviewer('one')");const second=h.run("speakInterviewer('two')");
  requests[1].resolve(speech);await tick();requests[0].reject(new Error('provider failure'));await first;
  assert.match(h.element('voiceStatus').textContent,/speaking/);assert.equal(audio[0].paused,false);
  h.run('cancelInterviewerSpeech()');await second;
});
test('capture suppresses playback without requesting synthesis',async()=>{
  const {h,requests}=playbackFixture();h.run('voiceState.recording=true');await h.run("speakInterviewer('one')");assert.equal(requests.length,0);
  h.run('voiceState.recording=false;microphoneState.busy=true');await h.run("speakInterviewer('two')");assert.equal(requests.length,0);
});
test('current synthesis failure falls back once and cancellation settles system playback',async()=>{
  const {h,requests}=playbackFixture();const utterances=[];
  h.context.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
  h.context.window.speechSynthesis={cancel(){},speak:utterance=>utterances.push(utterance)};
  h.run('voiceState.supportedSpeech=true');const pending=h.run("speakInterviewer('fallback sentence')");requests[0].reject(new Error('unavailable'));await tick();
  assert.equal(utterances.length,1);assert.equal(h.run('voiceState.audioPhase'),'speaking');
  await h.run("speakInterviewer('fallback sentence')");assert.equal(utterances.length,1);
  h.run("cancelInterviewerSpeech('recording')");await pending;assert.equal(h.run('voiceState.finishPlayback'),null);
});
test('automatic speech boundary tolerates thinking pauses and resets silence after resumed speech',()=>{
  for(const mode of ['interview','debrief']) {
    const h=renderer();let clock=0,frame;
    h.context.performance={now:()=>clock};h.context.requestAnimationFrame=callback=>{frame=callback;return 1;};
    h.run(`voiceState.mode=${JSON.stringify(mode)};voiceState.recording=true;window.__signal=128;window.__stops=0;voiceState.analyser={fftSize:1024,getByteTimeDomainData:data=>data.fill(window.__signal)};stopVoiceRecording=()=>{window.__stops++;voiceState.recording=false;};monitorSpeechSignal()`);
    frame();assert.equal(h.run('voiceState.speechDetected'),false);
    clock=100;h.run('window.__signal=148');frame();assert.equal(h.run('voiceState.speechDetected'),true);
    clock=2500;h.run('window.__signal=128');frame();assert.equal(h.run('voiceState.recording'),true);
    clock=3000;h.run('window.__signal=148');frame();
    clock=6999;h.run('window.__signal=128');frame();assert.equal(h.run('voiceState.recording'),true);
    clock=7000;frame();assert.equal(h.run('voiceState.recording'),false);assert.equal(h.run('window.__stops'),1);
    frame();assert.equal(h.run('window.__stops'),1);
    assert.deepEqual(h.json('answerRecordingPolicy'),{speechRms:10,minimumMs:2000,silenceMs:4000,noSpeechMs:15000});
  }
});
