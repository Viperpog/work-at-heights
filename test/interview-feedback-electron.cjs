// Actual learner renderer/main/preload. AI/TTS responses and audio playback are
// controlled doubles; no live services, hardware or normal learner profile.
const { app, BrowserWindow } = require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');const bank=require('../data/question-bank.json');
app.setAppPath(root);app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'wah-feedback-')));
let mode='incorrect',chatCalls=0;const spoken=[];
global.fetch=async(_url,options)=>{
 const body=JSON.parse(options.body);
 if(body.action==='tts'){spoken.push(body.text);return Response.json({audioBase64:'SUQz',mimeType:'audio/mpeg'});}
 chatCalls++;
 if(mode==='offline')throw Error('Synthetic offline');
 if(mode==='malformed')return Response.json({content:'not JSON'});
 return Response.json({content:JSON.stringify({evaluation:{score:mode==='correct'?1:mode==='partial'?1.5:0,correctness:mode==='correct'?'Correct':mode==='partial'?'Partially Correct':'Incorrect',isCorrect:mode==='correct',explanation:'Invented 99 meter rule.',positiveReinforcement:'Try that again.'},nextInterviewerMessage:'Mira, we are stepping back to rebuild the foundation before you move on.',shouldAdvance:false})});
};
app.on('web-contents-created',(_,contents)=>contents.setBackgroundThrottling(false));require('../src/main.js');
app.whenReady().then(async()=>{
 let passed=0;const timer=setTimeout(()=>app.exit(1),40000);const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code,true);
 const wait=async expression=>{const deadline=Date.now()+10000;while(!await js(expression)){if(Date.now()>deadline)throw Error('Timeout: '+expression);await new Promise(r=>setTimeout(r,30));}};
 const check=(name,value)=>{assert.ok(value,name);console.log(`PASS feedback ${++passed}: ${name}`);};
 try{
 await wait("typeof withInterviewFeedback==='function' && questionBank.length===240");
 await require('./dialog-test-helpers.cjs').acceptNotices(win.webContents);
 await js(`window.Audio=class{constructor(){this.currentTime=0;this.duration=1;}async play(){this.onplay?.();queueMicrotask(()=>this.onended?.());}pause(){}};true`);
 for(const scenario of [
  {name:'skip',mode:'incorrect',module:1,level:'expert',answer:'',skip:true,nextModule:2,nextLevel:'basic'},
  {name:'incorrect',mode:'incorrect',module:5,level:'expert',answer:'Unrelated synthetic answer',nextModule:6,nextLevel:'basic'},
  {name:'partial',mode:'partial',module:2,level:'expert',answer:'organization implements preventive measures and risk assessment',nextModule:3,nextLevel:'basic'},
  {name:'correct',mode:'correct',module:3,level:'basic',answer:'Synthetic correct response',nextModule:3,nextLevel:'intermediate'},
  {name:'offline fallback',mode:'offline',module:7,level:'expert',answer:'Unrelated synthetic answer',nextModule:8,nextLevel:'basic'},
  {name:'malformed fallback',mode:'malformed',module:4,level:'expert',answer:'Unrelated synthetic answer',nextModule:5,nextLevel:'basic'}
 ]){
  mode=scenario.mode;spoken.length=0;const callsBefore=chatCalls;const q=bank.find(q=>q.module===scenario.module&&q.difficulty===scenario.level);
  await js(`cancelInterviewerSpeech('test reset');document.getElementById('chatLog').replaceChildren();state.studentName='Synthetic Learner';state.studentEmail='feedback@example.invalid';state.selectedInstructorId='carlos';state.interviewCompleted=false;state.interview={currentModule:${q.module},currentLevel:${JSON.stringify(q.difficulty)},history:[],usedIds:[],recommendations:[],summary:'',activeQuestion:${JSON.stringify(q)}};voiceState.mode='interview';voiceState.enabled=true;voiceState.muted=false;voiceState.supportedSpeech=false;config.useLocalFallbackWhenApiFails=true;document.getElementById('answerBox').value=${JSON.stringify(scenario.answer)};true`);
  await js(`handleAnswer(${!!scenario.skip})`);await wait("document.querySelectorAll('#chatLog .msg.interviewer').length===2 && voiceState.pendingSpeechText===null");
  const messages=await js("Array.from(document.querySelectorAll('#chatLog .msg.interviewer'),node=>node.textContent)");
  check(scenario.name+' has one corrective/reinforcement bubble and actual transition',messages.length===2 && !/stepping back|rebuild|try that again|99 meter|revisit/.test(messages.join(' '))
   && await js(`state.interview.currentModule===${scenario.nextModule} && state.interview.currentLevel===${JSON.stringify(scenario.nextLevel)} && state.interview.history.length===1`));
  const visibleSpeech=await js("cleanTextForSpeech(Array.from(document.querySelectorAll('#chatLog .msg.interviewer'),node=>node.textContent).join(' '))");
  check(scenario.name+' speaks the visible explanation/actual question once',spoken.length===1&&spoken[0]===visibleSpeech);
  check(scenario.name+' retains score/skip and evaluation request policy',await js(`state.interview.history[0].skipped===${!!scenario.skip} && state.interview.history[0].evaluation.score===${scenario.mode==='correct'?1:scenario.mode==='partial'?1.5:0}`)
   && chatCalls-callsBefore===(scenario.skip?0:1));
 }
 mode='offline';await js("document.getElementById('chatLog').replaceChildren();config.useLocalFallbackWhenApiFails=false;state.interview.history=[];document.getElementById('answerBox').value='Retain this response';true");
 const before=await js('state.interview.activeQuestion.id');await js('handleAnswer(false)');
 check('disabled fallback retains answer/question with no credit or progression',await js(`document.getElementById('answerBox').value==='Retain this response' && state.interview.history.length===0 && state.interview.activeQuestion.id===${JSON.stringify(before)} && !document.getElementById('submitAnswer').disabled && document.querySelectorAll('#chatLog .msg.interviewer').length===0`));
 console.log(`Interview feedback: ${passed} passed, 0 failed. Synthetic AI and playback doubles; educational review remains manual.`);clearTimeout(timer);app.exit(0);
 }catch(error){console.error(error.stack||String(error));clearTimeout(timer);app.exit(1);}
});
