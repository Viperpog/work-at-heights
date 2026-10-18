// Real trusted IPC, isolated print window and Chromium PDF. Only native choosers
// and external services are doubles. pdf-lib is a development-only parser.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const { completedState } = require('./helpers.cjs');
const root = process.env.WAH_PACKAGED_APP || path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wah-pdf-'));
const output = process.env.WAH_PDF_OUTPUT || temp;
fs.mkdirSync(output, { recursive: true });
app.disableHardwareAcceleration(); app.setAppPath(root); app.setPath('userData', path.join(temp, 'profile'));
global.fetch = async () => { throw Error('Synthetic offline provider'); };
let destination, canceled = false, options, printData, printCalls = 0;
dialog.showSaveDialog = async value => { options=value; return { canceled, filePath: destination }; };
const printWindows = [];
app.on('web-contents-created', (_event, wc) => {
  wc.setBackgroundThrottling(false);
  const original = wc.printToPDF.bind(wc);
  wc.printToPDF = async opts => {
    printCalls++;
    printData = await wc.executeJavaScript(`({text:document.body.textContent, html:document.querySelector('main').innerHTML,
      privileged:typeof window.appApi!=='undefined'||typeof require!=='undefined',
      style:getComputedStyle(document.querySelector('main')).borderColor,
      font:document.fonts.check('16px Inter'), nodes:document.querySelectorAll('img,iframe,object').length})`);
    assert.equal(printData.privileged, false); assert.equal(printData.nodes, 0); assert.equal(printData.font, true);
    assert.equal(wc.getLastWebPreferences().sandbox, true);
    printWindows.push(wc.id);
    for (const url of ['https://example.invalid/', 'file:///C:/Windows/win.ini']) await assert.rejects(wc.session.fetch(url));
    return original(opts);
  };
});
require(path.join(root, 'src/main.js'));
app.whenReady().then(async () => {
  const timeout=setTimeout(()=>{console.error('PDF checks timed out');app.exit(1);},90000);
  let count=0;
  const check=(label,value=true)=>{assert.ok(value,label);console.log(`PASS PDF ${++count}: ${label}`);};
  const win=BrowserWindow.getAllWindows()[0];
  const js=code=>win.webContents.executeJavaScript(code,true);
  const wait=async code=>{const end=Date.now()+10000;while(!await js(code)){if(Date.now()>end)throw Error(code);await new Promise(r=>setTimeout(r,25));}};
  const capture=async name=>{if(process.env.WAH_PDF_OUTPUT){await js('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');fs.writeFileSync(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());}};
  try {
    if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
    await wait("typeof state!=='undefined' && questionBank.length===240 && microphoneState.ready");
    await require('./dialog-test-helpers.cjs').acceptNotices(win.webContents);
    win.setContentSize(1440,900);
    await js("$('beginTrack').click();true");
    const evidence=completedState(); evidence.studentName='Alex Morgan — Synthetic Learner';
    evidence.debriefing.completedAt='2026-10-18T12:00:00.000Z';
    evidence.debriefing.vrReportText='The participant identified hazards during the simulated equipment inspection. The activity included checking equipment and observing changing weather conditions.';
    evidence.debriefing.vrSummary=evidence.debriefing.vrReportText+' The report provides observations for reflection; it does not establish professional certification.';
    await js(`promptedSessionEmails.add(${JSON.stringify(evidence.studentEmail)});applySessionToState(${JSON.stringify(evidence)});setTab(5);renderVrStatus();`);
    await js("$('vrReportStatus').scrollIntoView({block:'center'});true");
    await capture('01-vr-analysis');
    await js("state.debriefingCompleted=false;state.debriefing.history=[];setTab(6);window.__spoken=[];speakInterviewer=async text=>{window.__spoken.push(text)};startDebriefing();");
    check('concise opening reaches narration exactly as displayed',await js("__spoken.length===1 && __spoken[0]===state.debriefing.history[0].text && __spoken[0].split(/\\s+/).length<=60 && !__spoken[0].includes(state.debriefing.vrSummary)"));
    await js('window.scrollTo(0,0);true');
    await capture('02-concise-debriefing');
    await js(`applySessionToState(${JSON.stringify(evidence)});setTab(7);updateCertificatePreview();`);
    win.setContentSize(1440,1000);
    await js('window.scrollTo(0,0);true');
    await capture('03-certificate-preview');
    canceled=true; const callsBefore=printCalls;
    await js("window.__saveDone=false;window.__originalSave=handleDocumentSave;handleDocumentSave=async(...args)=>{try{return await window.__originalSave(...args)}finally{window.__saveDone=true}};$('downloadCertificate').click();true");
    await wait('window.__saveDone');
    check('canceled native PDF Save does not render or mark download',await js('!state.certificateDownloaded'));
    check('cancellation avoids print window',printCalls===callsBefore);
    canceled=false;
    const samples=[['sample-certificate',evidence.studentName],['long-name',('Alexandre María Johnson '.repeat(9)).slice(0,200)],['international','José Gonçalves — Zoë Müller / 李明'],['hostile','Synthetic <img src="https://invalid.test/x" onerror="alert(1)"> & "Learner"']];
    for(const [name,learner] of samples){
      destination=path.join(temp,name+'.pdf');
      await js(`state.studentName=${JSON.stringify(learner)};updateCertificatePreview();`);
      const preview=await js("document.querySelector('.certificateInner').textContent");
      const level=await js('calculateOverallReadiness()');
      const result=await js('window.appApi.saveCertificate(state)');
      const bytes=fs.readFileSync(destination);
      if(process.env.WAH_PDF_OUTPUT)fs.copyFileSync(destination,path.join(output,name+'.pdf'));
      check(`${name}: successful PDF signature`,!result.canceled && bytes.subarray(0,5).toString()==='%PDF-');
      const pdf=await PDFDocument.load(bytes);
      check(`${name}: parser confirms one landscape A4 page`,pdf.getPageCount()===1 && Math.abs(pdf.getPage(0).getWidth()-841.89)<2 && Math.abs(pdf.getPage(0).getHeight()-595.28)<2);
      check(`${name}: exact shared preview/print text including validated learner, readiness and completion`,printData.text.trim()===preview && printData.text.includes(learner) && printData.text.includes(level) && printData.text.includes(new Date(evidence.debriefing.completedAt).toLocaleDateString()));
      check(`${name}: print surface remains isolated, escaped and gold-bordered`,printData.nodes===0 && !printData.privileged && printData.style==='rgb(159, 123, 48)');
      check(`${name}: print resources released`,printWindows.every(id=>!require('electron').webContents.fromId(id)) && BrowserWindow.getAllWindows().length===1);
    }
    check('native chooser defaults to PDF only',options.defaultPath.endsWith('.pdf') && options.filters[0].extensions.join(',')==='pdf');
    check('invalid evidence rejected before PDF generation',await js("(async()=>{try{await window.appApi.saveCertificate({...state,debriefingCompleted:false});return false}catch{return true}})()"));
    destination=path.join(output,'wrong.docx');
    check('Word destination rejected for certificate',await js("window.appApi.saveCertificate(state).then(()=>false,()=>true)"));
    check('remote and arbitrary file requests rejected by each actual print session',printCalls===4);
    destination=path.join(temp,'clicked-certificate.pdf');
    await js("window.__saveDone=false;$('downloadCertificate').click();true");
    await wait('window.__saveDone');
    check('actual successful export action marks the certificate downloaded',await js('state.certificateDownloaded') && fs.existsSync(destination));
    const factory=require(path.join(root,'src/certificate-pdf.cjs')).createCertificatePDF;
    await assert.rejects(factory({name:'Overflow probe',readiness:'Basic',qualification:'Oversized text '.repeat(10000),date:'Synthetic'}),/does not fit/);
    check('failed print layout rejects and releases its isolated window',BrowserWindow.getAllWindows().length===1);
    check('no privileged print window remains after policy checks',BrowserWindow.getAllWindows().length===1);
    console.log(`PDF certificate: ${count} passed, 0 failed. Real Chromium printing; parsed PDF; synthetic learner data.`);
    clearTimeout(timeout);app.exit(0);
  }catch(e){console.error(e);clearTimeout(timeout);app.exit(1);}
});
