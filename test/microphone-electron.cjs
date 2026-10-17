// Synthetic streams only. No physical microphone, network or learner profile.
const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'wah-microphone-check-'));
let calls=0, response=' <b>verbatim</b>\n you ', fail=false, cancelSave=false, pending=false, release;
global.fetch=async()=>{calls++;if(pending)await new Promise(resolve=>{release=resolve;});return fail?new Response('{}',{status:401}):Response.json({text:response});};
let speechBase64;
if(process.platform==='win32') {
 const wav=path.join(temporary,'sentence.wav');
 require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-Command',
  "Add-Type -AssemblyName System.Speech; $voice = New-Object System.Speech.Synthesis.SpeechSynthesizer; $voice.SetOutputToWaveFile($env:WAH_TEST_WAV); $voice.Speak('The orange safety helmet is beside the blue ladder.'); $voice.Dispose()"],
  {env:{...process.env,WAH_TEST_WAV:wav},timeout:20000});
 speechBase64=fs.readFileSync(wav).toString('base64');
}
dialog.showSaveDialog=async()=>cancelSave?{canceled:true}:{canceled:false,filePath:path.join(temporary,'test.webm')};
app.on('web-contents-created',(_,contents)=>contents.setBackgroundThrottling(false));
require('../dev/microphone/main.cjs');
app.whenReady().then(async()=>{
 let passed=0;const timer=setTimeout(()=>app.exit(1),60000);
 const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code,true);
 const check=(name,value)=>{assert.ok(value,name);console.log(`PASS microphone ${++passed}: ${name}`);};
 const wait=async expression=>{const deadline=Date.now()+12000;while(!await js(expression)){if(Date.now()>deadline)throw Error('Timed out: '+expression);await new Promise(r=>setTimeout(r,40));}};
 try{
 await wait("typeof mimeType==='function'");
 check('isolated sandboxed narrow preload',await js("typeof require==='undefined' && Object.keys(window.microphoneApi).sort().join(',')==='save,transcribe' && Object.isFrozen(window.microphoneApi)")&&win.webContents.getLastWebPreferences().sandbox);
 await js(`window.__constraints=[];window.__tracks=[];window.__contexts=[];window.__mode='tone';
 navigator.mediaDevices.enumerateDevices=async()=>[{kind:'audioinput',deviceId:'default',label:'Default - Synthetic mic'},{kind:'audioinput',deviceId:'specific',label:'Specific synthetic mic'}];
 navigator.mediaDevices.getUserMedia=async constraints=>{
 window.__constraints.push(constraints);if(window.__mode==='denied')throw new DOMException('Denied','NotAllowedError');
 const ctx=new AudioContext();await ctx.resume();window.__contexts.push(ctx);const dest=ctx.createMediaStreamDestination();
 let source;if(window.__mode==='speech'){source=ctx.createBufferSource();source.buffer=await ctx.decodeAudioData(Uint8Array.from(atob(window.__speech),c=>c.charCodeAt(0)).buffer);}else source=ctx.createOscillator();const gain=ctx.createGain();gain.gain.value=window.__mode==='silence'?0:0.25;source.connect(gain);gain.connect(dest);source.start();
 const track=dest.stream.getAudioTracks()[0];window.__tracks.push(track);return dest.stream;};true`);
 await js("document.getElementById('permission').click();true");await wait("!busy");
 check('permission reveals labels/default and stops permission stream',await js("document.getElementById('defaultDevice').textContent.includes('Default - Synthetic mic') && document.getElementById('devices').options.length===3 && window.__tracks.every(t=>t.readyState==='ended')"));
 await js("document.getElementById('record').click();true");await wait('recording && peak>0 && duration>=0.5');await js("document.getElementById('stop').click();true");await wait('!!blob && !recording');
 check('default selection uses WAH audio constraints and WebM Opus',await js("window.__constraints.at(-1).audio===true && blob.size>0 && blob.type===mimeType() && duration>0 && peak>0"));
 check('no automatic transcription',calls===0);
 check('local playback starts',await js("document.getElementById('playback').muted=true;document.getElementById('playback').play().then(()=>!document.getElementById('playback').paused)"));
 await js("document.getElementById('save').click();true");await wait('!busy');
 check('dialog export saves actual recording',fs.readFileSync(path.join(temporary,'test.webm')).length===await js('blob.size'));
 cancelSave=true;await js("document.getElementById('save').click();true");await wait('!busy');check('save cancellation handled',await js("document.getElementById('status').textContent==='Save canceled.'"));
 await js("document.getElementById('transcribe').click();true");await wait('!busy');
 check('explicit transcription preserves whitespace and HTML as text',calls===1&&await js("document.getElementById('transcript').textContent===' <b>verbatim</b>\\n you ' && document.getElementById('transcript').children.length===0"));
 fail=true;await js("document.getElementById('transcribe').click();true");await wait('!busy');check('HTTP failure surfaced and stale transcript cleared',await js("document.getElementById('status').textContent.includes('HTTP 401') && document.getElementById('transcript').textContent===''") );fail=false;
 response='';await js("document.getElementById('transcribe').click();true");await wait('!busy');check('empty transcript handled',await js("document.getElementById('status').textContent.includes('empty transcript')"));
 response=42;await js("document.getElementById('transcribe').click();true");await wait('!busy');check('malformed provider response rejected',await js("document.getElementById('status').textContent.includes('invalid response')"));response='late result';
 pending=true;await js("document.getElementById('transcribe').click();true");while(!release)await new Promise(r=>setTimeout(r,10));await js("document.getElementById('cancel').click();true");release();await wait('!busy');pending=false;
 check('cancel ignores in-flight transcription result',await js("document.getElementById('transcript').textContent==='' && !blob"));
 await js("window.__mode='silence';document.getElementById('devices').value='specific';document.getElementById('record').click();true");await wait('recording && samples>=4096');await js("document.getElementById('stop').click();true");await wait('!!blob && !recording');
 check('explicit device uses exact deviceId and silence remains recordable',await js("window.__constraints.at(-1).audio.deviceId.exact==='specific' && blob.size>0 && peak===0 && document.getElementById('stats').textContent.includes('Near-silent indicator: yes')"));
 await js("document.getElementById('cancel').click();true");
 check('discard releases tracks/blob/playback',await js("blob===null && objectURL===null && context===null && window.__tracks.every(t=>t.readyState==='ended') && !document.getElementById('playback').getAttribute('src')"));
 await js("window.__mode='denied';document.getElementById('record').click();true");await wait('!busy');check('permission denial recovers controls',await js("document.getElementById('status').textContent.includes('NotAllowedError') && !document.getElementById('record').disabled && !stream"));
 await js("window.__mode='tone';document.getElementById('record').click();true");await wait('recording');await js("document.getElementById('cancel').click();true");await new Promise(r=>setTimeout(r,100));
 check('recording cancellation discards queued chunks',await js('!recording && !blob && !stream && !context'));
 if(speechBase64){
  await js(`window.__speech=${JSON.stringify(speechBase64)};window.__mode='speech';document.getElementById('record').click();true`);
  await wait('recording && peak>0');await new Promise(r=>setTimeout(r,4000));await js("document.getElementById('stop').click();true");await wait('!!blob && !recording');
  check('Windows synthesized sentence records through real MediaRecorder',await js('blob.size>1000 && peak>0 && duration>=4'));
 }else console.log('LIMITATION: Windows speech fixture unavailable on this OS; tone/silence exercised.');
 if(!await js('!!blob')) {
  await js("window.__mode='tone';document.getElementById('record').click();true");await wait('recording && peak>0 && duration>=0.5');await js("document.getElementById('stop').click();true");await wait('!!blob && !recording');
 }
 const callsBeforeReadCancel=calls;
 await js("window.__originalRead=FileReader.prototype.readAsDataURL;FileReader.prototype.readAsDataURL=function(value){setTimeout(()=>window.__originalRead.call(this,value),100);};document.getElementById('transcribe').click();document.getElementById('cancel').click();true");await wait('!busy');
 check('cancel during base64 conversion settles without sending',calls===callsBeforeReadCancel&&await js('!blob && !recording'));
 await js('FileReader.prototype.readAsDataURL=window.__originalRead;true');
 check('CSP rejects inline script and renderer network',await js(`(()=>{const script=document.createElement('script');script.textContent='window.__injected=true';document.body.append(script);return !window.__injected;})()`)
  && await js("fetch('https://example.invalid').then(()=>false,()=>true)"));
 check('malformed IPC rejected by real handler',await js("window.microphoneApi.save({audioBase64:'AAAA',mimeType:'text/html'}).then(()=>false,()=>true)"));
 check('unregistered window cannot use diagnostic IPC',await (async()=>{const other=new BrowserWindow({show:false,webPreferences:{preload:path.resolve(__dirname,'../dev/microphone/preload.cjs'),contextIsolation:true,sandbox:true}});await other.loadURL('about:blank');const rejected=await other.webContents.executeJavaScript("window.microphoneApi.transcribe({audioBase64:'AAAA',mimeType:'audio/webm'}).then(()=>false,()=>true)");other.destroy();return rejected;})());
 await js("Promise.all(window.__contexts.map(ctx=>ctx.close().catch(()=>{})))");
 console.log(`Microphone diagnostic: ${passed} passed, 0 failed. Physical microphone/live provider not tested.`);clearTimeout(timer);app.exit(0);
 }catch(error){console.error(error?.stack || String(error));clearTimeout(timer);app.exit(1);}
});
