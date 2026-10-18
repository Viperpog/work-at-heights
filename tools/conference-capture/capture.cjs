// Real application renderer capture; no production source or assessment changes.
const {app, BrowserWindow, dialog, shell}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {Document,Packer,Paragraph}=require('docx');
const root=path.resolve(__dirname,'../..');
const out=path.resolve(process.env.WAH_CAPTURE_OUTPUT || path.join(root,'conference-media',new Date().toISOString().replace(/[:.]/g,'-')));
fs.mkdirSync(out,{recursive:true});
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('force-device-scale-factor','1');
app.setAppPath(root);app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'wah-conference-')));
global.fetch=async()=>{throw Error('Conference capture: offline services only');};
shell.openExternal=async()=>{};
let destination=path.join(out,'certificate.pdf');
const exportsDir=fs.mkdtempSync(path.join(os.tmpdir(),'wah-conference-exports-'));
dialog.showSaveDialog=async()=>({canceled:false,filePath:path.join(exportsDir,path.basename(destination))});
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(out,'synthetic-vr.docx')]});
app.on('web-contents-created',(_,wc)=>wc.setBackgroundThrottling(false));
require(path.join(root,'src/main.js'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const manifest={sourceCommit:spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim(),resolution:[1920,1080],syntheticOnly:true,provider:'offline application fallback',assets:[],limitations:['Interaction clips sample real capturePage frames with recorded timestamps, encoded at 30 fps with frame duplication; they are not continuous 30 fps screen recordings.','Voice toggle is genuine; speech output is suppressed in the harness. No microphone or audio is recorded.','Offline VR fallback is shown truthfully; no live AI analysis is claimed.'],missing:[]};
app.whenReady().then(async()=>{
 const timer=setTimeout(()=>{console.error('Capture timeout');app.exit(1);},240000);
 const win=BrowserWindow.getAllWindows()[0],wc=win.webContents;
 const js=code=>wc.executeJavaScript(code,true);
 const wait=async code=>{const end=Date.now()+15000;while(!await js(code)){if(Date.now()>end)throw Error('Timeout '+code);await pause(40);}};
 const settle=async()=>{await js('document.fonts.ready.then(()=>true)');await wait('[...document.images].every(i=>i.complete&&i.naturalWidth>0)');await pause(180);};
 const shot=async(name,stage,rect)=>{await settle();const img=await wc.capturePage(rect);assert.deepEqual(img.getSize(),rect?{width:rect.width,height:rect.height}:{width:1920,height:1080});fs.writeFileSync(path.join(out,name+'.png'),img.toPNG());manifest.assets.push({file:name+'.png',stage,type:'screenshot',dimensions:img.getSize(),source:'Electron webContents.capturePage',crop:rect||null});console.log('Captured '+name);};
 const clip=async(name,stage,action)=>{
  const dir=path.join(out,name+'-frames');fs.mkdirSync(dir,{recursive:true});const frames=[];let running=true;
  const start=performance.now();
  const loop=(async()=>{while(running){const img=await wc.capturePage();const file=`${String(frames.length).padStart(5,'0')}.png`;fs.writeFileSync(path.join(dir,file),img.toPNG());frames.push({file,ms:performance.now()-start});await pause(65);}})();
  await pause(450);try{await action();await pause(1100);}finally{running=false;await loop;}
  fs.writeFileSync(path.join(dir,'timestamps.json'),JSON.stringify(frames,null,2));
  const lines=[];for(let i=0;i<frames.length;i++){lines.push(`file '${frames[i].file}'`,`duration ${((frames[i+1]?.ms ?? frames[i].ms+100)-frames[i].ms)/1000}`);}lines.push(`file '${frames.at(-1).file}'`);
  fs.writeFileSync(path.join(dir,'frames.txt'),lines.join('\n'));
  const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',path.join(dir,'frames.txt'),'-vf','fps=30','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-an',path.join(out,name+'.mp4')],{encoding:'utf8'});
  const encoded=result.status===0;
  manifest.assets.push({file:encoded?name+'.mp4':name+'-frames/timestamps.json',stage,type:encoded?'sampled-interaction-video':'timestamped-frame-sequence',fps:encoded?30:null,capturedFrames:frames.length,durationMs:frames.at(-1).ms,measuredSamplingFps:1000*(frames.length-1)/(frames.at(-1).ms-frames[0].ms),source:'Real Electron frames during actual DOM actions; no cursor compositing'});
  if(!encoded)manifest.missing.push(`${name}: MP4 encoding unavailable: ${result.stderr||result.error}`);
 };
 try{
  if(wc.isLoading())await new Promise(r=>wc.once('did-finish-load',r));
  win.setResizable(true);win.setContentSize(1920,1080);wc.setZoomFactor(1);win.show();
  await wait("typeof state!=='undefined' && questionBank.length===240 && finalQuizBank.length===240");
  await require('../../test/dialog-test-helpers.cjs').acceptNotices(wc);
  // Only audio output is suppressed, following the visual test harness. Evaluation stays real.
  await js('speakInterviewer=async()=>{};Math.random=()=>0;true');
  await shot('01-welcome','Welcome / Begin Training');
  await js("$('beginTrack').click();$('studentName').value='Synthetic Learner';$('studentEmail').value='conference@example.invalid';$('studentEmail').dispatchEvent(new Event('input'));true");await pause(450);
  await shot('02-orientation','Orientation');
  await js("$('openSmartChats').click();$('completeLearning').click();true");await wait('state.currentTab===2');
  const csv='email,question\nconference@example.invalid,How should I inspect a harness before use?\nconference@example.invalid,How is wind assessed before starting work?\nconference@example.invalid,What should a rescue plan contain?';
  fs.writeFileSync(path.join(out,'synthetic-smartchats.csv'),csv);
  await js(`{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(csv)}],'synthetic-smartchats.csv',{type:'text/csv'}));$('smartCsv').files=dt.files;$('smartCsv').dispatchEvent(new Event('change'));}`);await wait('state.smartchatsCompleted');
  await shot('03-smartchats-analysis','SmartChats Analysis');
  await js("$('completeSmart').click();true");await shot('04-instructor-selection','AI Instructor Selection');
  const portraits=await js("[...document.querySelectorAll('#instructorChoices img,.instructorChoices img')].map(i=>({src:i.src,alt:i.alt}))");
  manifest.portraits=portraits;
  await clip('interaction-instructor','Selecting an AI instructor',()=>js("document.querySelector('[data-instructor-id=\"carlos\"]').click();true"));
  await js('openInstructorModal();true');await shot('05-instructor-portraits','Instructor portraits close-up');await js('closeInstructorModal();true');
  await clip('interaction-question','Starting interview / question appearing',()=>js("$('startInterview').click();true"));await wait('state.interview.activeQuestion!==null');await shot('06-adaptive-interview','Adaptive Interview');
  await clip('interaction-voice','Enabling voice interview',()=>js("$('toggleVoiceMode').click();true"));await shot('07-voice-enabled','Voice interview enabled');await js("$('toggleVoiceMode').click();true");
  await clip('interaction-feedback','Typed response and actual corrective feedback',async()=>{await js("$('answerBox').value='I would start immediately without checking the conditions.';$('answerBox').dispatchEvent(new Event('input'));true");await pause(700);await js("$('submitAnswer').click();true");await wait('state.interview.history.length===1');});
  await shot('08-interview-feedback','Interview corrective feedback');
  assert.ok(await js('!state.interview.history[0].evaluation.isCorrect'));
  for(let i=0;!await js('state.interviewCompleted');i++){assert.ok(i<30);await js('handleAnswer(true)');await pause(300);}
  destination=path.join(out,'interview.docx');await js("$('exportInterview').click();true");await wait("!$('unlockQuiz').disabled");
  await js("$('unlockQuiz').click();$('startQuiz').click();true");await shot('09-adaptive-quiz','Adaptive Quiz');
  await clip('interaction-quiz','Selecting quiz answer / revealing correct answer',async()=>{await js("document.querySelectorAll('input[data-quiz-option]')[(state.quiz.activeQuestion.correctIndex+1)%state.quiz.activeQuestion.options.length].click();true");await pause(700);await js("$('submitQuizAnswer').click();true");});
  assert.ok(await js("$('quizFeedback').textContent.includes(state.quiz.activeQuestion.explanation) && !!document.querySelector('.incorrectAnswer')"));await shot('10-quiz-feedback','Quiz answer-revealed feedback');
  await js("$('nextQuizQuestion').click();true");
  for(let i=0;!await js('state.quizCompleted');i++){assert.ok(i<40);await js("document.querySelectorAll('input[data-quiz-option]')[state.quiz.activeQuestion.correctIndex].click();$('submitQuizAnswer').click();$('nextQuizQuestion').click();true");}
  destination=path.join(out,'quiz.docx');await js("$('exportQuiz').click();true");await wait("!$('unlockVrAnalysis').disabled");
  const report=['Synthetic VR training report — conference demonstration','VR readiness: Intermediate','Learner: Synthetic Learner','Inspected the harness and selected a designated anchor. Paused when wind conditions changed. Required a prompt to confirm rescue arrangements before resuming.'];
  fs.writeFileSync(path.join(out,'synthetic-vr.docx'),await Packer.toBuffer(new Document({sections:[{children:report.map(t=>new Paragraph(t))}]})));
  await js("$('unlockVrAnalysis').click();analyzeVrReport()");await wait('state.vrCompleted');await shot('11-vr-analysis','VR Experience Analysis');
  await js("$('continueDebriefing').click();true");await shot('12-facilitator-selection','Debriefing Facilitator Selection');
  await clip('interaction-debrief','Beginning guided debriefing',()=>js("$('startDebrief').click();true"));await wait("$('debriefLog').textContent.length>0");await shot('13-guided-debriefing','Guided Debriefing');
  for(const answer of ['I paused when the wind changed and checked the anchor before continuing.','I should confirm the rescue plan and communication arrangements before starting.','I will inspect equipment and stop when conditions change.','I will brief the team and verify the rescue arrangements before the next task.'])await js(`$('debriefAnswerBox').value=${JSON.stringify(answer)};submitDebriefingAnswer()`);
  await wait('state.debriefingCompleted');destination=path.join(out,'debrief.docx');await js("$('exportDebrief').click();true");await wait("!$('continueCertificate').disabled");
  await clip('interaction-certificate','Showing certificate preview and exporting PDF',async()=>{await js("$('continueCertificate').click();true");destination=path.join(out,'certificate.pdf');await js("$('downloadCertificate').click();true");await wait('state.certificateDownloaded');});
  assert.ok(await js("$('certStudentName').textContent===state.studentName && $('certEmail').textContent===state.studentEmail"));await shot('14-certificate-preview','PDF Certificate Preview (application certificate screen)');
  for(const file of fs.readdirSync(exportsDir))fs.copyFileSync(path.join(exportsDir,file),path.join(out,file));
  assert.equal(fs.readFileSync(destination).subarray(0,5).toString(),'%PDF-');
  fs.writeFileSync(path.join(out,'synthetic-session.json'),JSON.stringify(await js('JSON.parse(JSON.stringify(state))'),null,2));
  // Contact sheet is a labeled derivative of captured images, not a UI screenshot.
  await require("./contact-sheet.cjs")(out,manifest.assets.filter(a=>a.type==="screenshot"));
  manifest.assets.push({file:'contact-sheet.png',type:'contact-sheet',source:'Labeled thumbnails of authentic captures'});
  manifest.verification={completeSession:true,pdfSignature:true,quizBankExplanation:true,incorrectInterviewAnswer:true,vrImportedViaDocx:true,normalProfileUntouched:true};
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log('OUTPUT '+out);clearTimeout(timer);app.exit(0);
 }catch(e){manifest.error=e.stack;fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.error(e);console.error('OUTPUT '+out);clearTimeout(timer);app.exit(1);}
});



