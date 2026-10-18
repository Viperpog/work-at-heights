// Verify and inventory an existing completed capture; never alters media frames.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');const {spawnSync}=require('node:child_process');
const {PDFDocument}=require('pdf-lib');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.argv[2]);
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json')));
 assert.ok(!manifest.error&&manifest.verification.completeSession);
 const state=JSON.parse(fs.readFileSync(path.join(out,'synthetic-session.json')));
 assert.equal(state.studentName,'Synthetic Learner');assert.equal(state.studentEmail,'conference@example.invalid');
 for(const [history,bankFile] of [[state.interview.history,'question-bank.json'],[state.quiz.history,'final-quiz-bank.json']]){
  const bank=JSON.parse(fs.readFileSync(path.join(root,'data',bankFile)));
  for(const item of history)assert.deepEqual(item.question,bank.find(q=>q.id===item.question.id));
 }
 const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 manifest.approvedPortraits=fs.readdirSync(path.join(root,'src/assets/instructors')).filter(f=>f.endsWith('.png')).map(f=>({file:'src/assets/instructors/'+f,sha256:hash(path.join(root,'src/assets/instructors',f))}));
 for(const asset of manifest.assets.filter(a=>a.type==='sampled-interaction-video')){
  const result=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate','-of','json',path.join(out,asset.file)],{encoding:'utf8'});assert.equal(result.status,0);
  const stream=JSON.parse(result.stdout).streams[0];assert.equal(stream.width,1920);assert.equal(stream.height,1080);assert.equal(stream.r_frame_rate,'30/1');
 }
 const pdf=await PDFDocument.load(fs.readFileSync(path.join(out,'certificate.pdf')));assert.equal(pdf.getPageCount(),1);assert.ok(pdf.getPage(0).getWidth()>pdf.getPage(0).getHeight());
 const files=[];const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.name!=='manifest.json')files.push({file:path.relative(out,full).replaceAll('\\','/'),bytes:fs.statSync(full).size,sha256:hash(full)});}};walk(out);
 manifest.fileInventory=files;manifest.verification.bankQuestionsExact=true;manifest.verification.mp4Probed=true;manifest.verification.onePageLandscapePdf=true;
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
 console.log(JSON.stringify({screenshots:manifest.assets.filter(a=>a.type==='screenshot').length,clips:manifest.assets.filter(a=>a.type==='sampled-interaction-video').length,missing:manifest.missing,samplingFps:manifest.assets.filter(a=>a.measuredSamplingFps).map(a=>Number(a.measuredSamplingFps.toFixed(1))),inventoryFiles:files.length},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
