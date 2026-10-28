const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } = require('docx');

const { loadServiceConfig, createServiceClient } = require('./services.cjs');
const serviceConfig = loadServiceConfig(app.getAppPath());
const services = createServiceClient(serviceConfig, { fetchImpl: (...args) => fetch(...args) });
const security = require('./security.cjs');
const vrContract = require('./vr-contract.cjs');
const { createVrBridge, adbReverse } = require('./vr-bridge.cjs');
// WAH_VR_PORT exists for tests (0 = any free port); the headset build always uses 8787.
const vrBridge = createVrBridge({ port: process.env.WAH_VR_PORT !== undefined ? Number(process.env.WAH_VR_PORT) : undefined });
const documentURL = security.pathToFileURL(path.join(__dirname, 'index.html')).href;
const trustedWindows = new Set();
const interviewBank = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'data/question-bank.json'), 'utf8'));
const quizBank = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'data/final-quiz-bank.json'), 'utf8'));

function handle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!security.trustedSender(event, trustedWindows, documentURL)) throw new Error('Untrusted IPC sender.');
    // select-vr-report takes an optional { planId, seenSessionIds } (validated by security.vrImportContext).
    if (!(NO_ARGUMENTS.includes(channel) ? [0] : channel === 'select-vr-report' ? [0, 1] : [1]).includes(args.length)) throw new Error('Invalid IPC arguments.');
    return handler(event, ...args);
  });
}
const NO_ARGUMENTS = ['save-ebook', 'vr-bridge-status', 'vr-bridge-take-reports'];

// Main -> renderer notices of the VR bridge: status changes and "a report is waiting". Reports themselves are pulled with vr-bridge-take-reports.
function notifyRenderers(payload) {
  for (const contents of trustedWindows) if (!contents.isDestroyed()) contents.send('vr-bridge-event', payload);
}
vrBridge.events.on('status', status => notifyRenderers({ type: 'status', status }));
vrBridge.events.on('report', () => notifyRenderers({ type: 'report' }));

async function saveDocument(options, buffer) {
  const { canceled, filePath } = await dialog.showSaveDialog(options);
  if (canceled || !filePath) return { canceled: true };
  const target = security.savePath(filePath, app.getAppPath());
  fs.writeFileSync(target, buffer);
  return { canceled: false, filePath: target };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false
    }
  });
  const contents = win.webContents;
  trustedWindows.add(contents);
  contents.once('destroyed', () => trustedWindows.delete(contents));
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => { if (url !== documentURL) event.preventDefault(); });
  contents.on('will-frame-navigate', event => { if (!event.isMainFrame || event.url !== documentURL) event.preventDefault(); });
  contents.on('will-redirect', event => event.preventDefault());
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !security.resourceAllowed(details.url, details.resourceType, app.getAppPath()) });
  });
  const allowedMedia = (wc, permission, details) => trustedWindows.has(wc) && wc.getURL() === documentURL
    && permission === 'media' && details?.requestingUrl === documentURL && details.isMainFrame === true;
  contents.session.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(Boolean(allowedMedia(wc, permission, details) && Array.isArray(details.mediaTypes)
      && details.mediaTypes.length > 0 && details.mediaTypes.every(type => type === 'audio')));
  });
  contents.session.setPermissionCheckHandler((wc, permission, _origin, details) => Boolean(allowedMedia(wc, permission, details) && details.mediaType === 'audio'));
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { vrBridge.stop(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

handle('read-json', async (_, relativePath) => {
  if (relativePath === 'data/config.json') return !app.isPackaged && process.env.WAH_AUDIO_DIAGNOSTICS === '1'
    ? { ...serviceConfig.rendererConfig, audioDiagnostics: true } : serviceConfig.rendererConfig;
  if (!['data/question-bank.json', 'data/final-quiz-bank.json'].includes(relativePath)) throw new Error('Unsupported application data.');
  const p = path.join(app.getAppPath(), relativePath);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
});

handle('save-ebook', async () => {
  const src = path.join(app.getAppPath(), 'docs', 'NR35_Revised_Professional_Ebook_Combined.docx');
  return saveDocument({
    title: 'Save NR-35 ebook',
    defaultPath: 'NR35_Revised_Professional_Ebook_Combined.docx',
    filters: [{ name: 'Word Document', extensions: ['docx'] }]
  }, fs.readFileSync(src));
});

handle('open-external', async (_, url) => shell.openExternal(security.externalURL(url)));

// Errors from services contain operation/status only, never upstream bodies or learner data.
handle('call-cimatec', async (_event, payload) => services.chat(payload));
handle('transcribe-audio', async (_event, payload) => services.transcribe(payload));
handle('synthesize-speech', async (_event, payload) => services.speech(payload));

handle('select-vr-report', async (_, context) => {
  const expected = security.vrImportContext(context);
  const result = await dialog.showOpenDialog({
    title: 'Select VR Experience Report',
    properties: ['openFile'],
    filters: [{ name: 'VR report (.json or .docx)', extensions: ['json', 'docx'] }, { name: 'Word Document', extensions: ['docx'] }, { name: 'VR event log', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  const filePath = result.filePaths[0];
  if (path.extname(filePath).toLowerCase() === '.json') return security.readVrJson(filePath, expected);
  return security.readReport(filePath, options => mammoth.extractRawText(options));
});

// Plan for the headset (wah.session_plan 1.0). The e-mail is turned into a pseudonym here and never leaves this process.
handle('create-session-plan', async (_, input) => {
  const o = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (Object.keys(o).some(key => !['email', 'smartChatsLevel', 'interviewLevel', 'quizLevel', 'quizScorePct', 'weakTopics', 'mode'].includes(key))) throw new Error('Invalid session plan input.');
  return vrContract.buildSessionPlan({ ...o, mode: o.mode === undefined ? 'study' : o.mode });
});

handle('save-session-plan', async (_, plan) => {
  vrContract.validateSessionPlan(plan);
  const { canceled, filePath } = await dialog.showSaveDialog({ title: 'Save VR session plan', defaultPath: 'session_plan.json', filters: [{ name: 'Session plan', extensions: ['json'] }] });
  if (canceled || !filePath) return { canceled: true };
  const target = security.savePath(filePath, app.getAppPath(), '.json');
  fs.writeFileSync(target, JSON.stringify(plan, null, 2) + '\n');
  return { canceled: false, filePath: target };
});

// Phase 3: the plan goes to the headset over WebSocket. The server starts on the first "Connect Quest" and stays on loopback;
// adb failures are reported but do not stop the server (the operator can run adb reverse by hand, or use the file fallback).
handle('vr-bridge-connect', async (_, input) => {
  const { plan, seenSessionIds } = security.vrBridgeInput(input);
  vrBridge.setPlan(plan, seenSessionIds);
  try { await vrBridge.start(); }
  catch (error) { return { status: vrBridge.status(), server: { ok: false, message: error.message }, adb: null }; }
  const adb = await adbReverse({ port: vrBridge.status().port });
  return { status: vrBridge.status(), server: { ok: true }, adb };
});
handle('vr-bridge-status', async () => vrBridge.status());
handle('vr-bridge-take-reports', async () => vrBridge.takeReports());

function p(text, opts = {}) {
  return new Paragraph({
    text: text || '',
    heading: opts.heading,
    alignment: opts.alignment,
    spacing: { before: opts.before || 0, after: opts.after || 140 }
  });
}
function titlePara(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 180 },
    children: [new TextRun({ text, bold: true, size: 36 })]
  });
}
function subtitlePara(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 260 },
    children: [new TextRun({ text, italics: true, size: 22 })]
  });
}
function sectionPara(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true })]
  });
}
function runPara(label, value) {
  return new Paragraph({
    spacing: { after: 110 },
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun({ text: String(value ?? '') })
    ]
  });
}
function cell(text, bold = false) {
  return new TableCell({
    margins: { top: 120, bottom: 120, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text: String(text ?? ''), bold })] })]
  });
}
function summaryTable(pairs) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: pairs.map(([label, value]) => new TableRow({ children: [cell(label, true), cell(value)] }))
  });
}
function safeName(name, fallback = 'student') {
  return (name || fallback).replace(/[^a-z0-9]/gi, '_').slice(0, 80);
}

handle('save-interview-report', async (_, input) => {
  const state = security.validateEvidence(input, interviewBank, quizBank, false);
  const rows = [
    new TableRow({ children: ['Module','Difficulty','Question','Answer','Score','Feedback'].map(cell) }),
    ...state.interview.history.map(h => new TableRow({ children: [
      cell(`Module ${h.question.module}: ${h.question.moduleTitle}`),
      cell(h.question.difficulty),
      cell(h.question.question),
      cell(h.skipped ? 'I do not know / skipped' : h.answer),
      cell(`${h.evaluation.score}/${h.question.maxScore}`),
      cell(`${h.evaluation.correctness}. ${h.evaluation.positiveReinforcement} ${h.evaluation.explanation} ${h.evaluation.improvementGuidanceText || ''}`)
    ]}))
  ];
  const doc = new Document({ sections: [{ children: [
    titlePara('Interview Report'),
    subtitlePara('Working at Height Learning Track | NR-35 Weather and Safety Focus'),
    runPara('Student', state.studentName),
    runPara('Email', state.studentEmail),
    runPara('Instructor', state.selectedInstructorId || 'Not selected'),
    runPara('Date', new Date().toLocaleString()),
    runPara('SmartChats Level', state.expertiseAfterSmartChats || 'Not available'),
    runPara('Interview Level', state.expertiseAfterInterview || 'Not completed'),
    runPara('Readiness Score', state.interviewScore ?? 0),
    sectionPara('Interview Summary'),
    p(state.interview.summary || 'No summary generated.'),
    sectionPara('Question-Level Evidence'),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
    sectionPara('Recommended Review'),
    ...((state.interview.recommendations || []).length ? state.interview.recommendations.map(r => p(`Module ${r.module}, Chapter ${r.chapter}: ${r.topic}`)) : [p('No required review chapters were identified.')])
  ]}]});
  return saveDocument({
    title: 'Save Interview Report',
    defaultPath: `${safeName(state.studentName)}_interview_report.docx`,
    filters: [{ name: 'Word Document', extensions: ['docx'] }]
  }, await Packer.toBuffer(doc));
});

handle('save-quiz-report', async (_, input) => {
  const state = security.validateEvidence(input, interviewBank, quizBank, false);
  const quiz = state.quiz || { history: [], recommendations: [] };
  const rows = [
    new TableRow({ children: ['Module','Difficulty','Question','Selected Answer','Correct Answer','Result','Points','Explanation'].map(cell) }),
    ...(quiz.history || []).map(h => new TableRow({ children: [
      cell(`Module ${h.question.module}: ${h.question.moduleTitle}`),
      cell(h.question.difficulty),
      cell(h.question.question),
      cell(h.selectedText || ''),
      cell(h.correctText || ''),
      cell(h.correct ? 'Correct' : 'Incorrect'),
      cell(`${h.earnedPoints}/${h.question.points}`),
      cell(h.question.explanation || '')
    ]}))
  ];
  const doc = new Document({ sections: [{ children: [
    titlePara('Quiz Report'),
    subtitlePara('Working at Height Learning Track | NR-35 Weather and Safety Focus'),
    runPara('Student', state.studentName),
    runPara('Email', state.studentEmail),
    runPara('Instructor', state.selectedInstructorId || 'Not selected'),
    runPara('Date', new Date().toLocaleString()),
    runPara('SmartChats Level', state.expertiseAfterSmartChats || 'Not available'),
    runPara('Interview Level', state.expertiseAfterInterview || 'Not completed'),
    runPara('Quiz Score', state.quizScore || 'Not completed'),
    runPara('Quiz Readiness', state.expertiseAfterQuiz || 'Not completed'),
    runPara('Questions Presented', (quiz.history || []).length),
    sectionPara('Quiz Summary'),
    p(quiz.summary || 'No quiz summary generated.'),
    sectionPara('Question-Level Results'),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
    sectionPara('Recommended Review'),
    ...((quiz.recommendations || []).length ? quiz.recommendations.map(r => p(`Module ${r.module}, Chapter ${r.chapter}: ${r.topic}`)) : [p('No required review chapters were identified from incorrect quiz responses.')]),
    sectionPara('VR Readiness Message'),
    p(quiz.vrMessage || 'Please review your results before continuing to the VR activity.')
  ]}]});
  return saveDocument({
    title: 'Save Quiz Report',
    defaultPath: `${safeName(state.studentName)}_quiz_report.docx`,
    filters: [{ name: 'Word Document', extensions: ['docx'] }]
  }, await Packer.toBuffer(doc));
});

handle('save-debriefing-report', async (_, input) => {
  const state = security.validateEvidence(input, interviewBank, quizBank, false);
  const d = state.debriefing || {};
  const rows = [
    new TableRow({ children: ['Speaker','Message'].map(cell) }),
    ...(d.history || []).map(item => new TableRow({ children: [cell(item.role === 'user' ? 'Learner' : 'Debriefing Facilitator'), cell(item.text || '')] }))
  ];
  const doc = new Document({ sections: [{ children: [
    titlePara('Debriefing Report'),
    subtitlePara('Working at Height Learning Track | NR-35 Weather and Safety Focus'),
    runPara('Student', state.studentName),
    runPara('Email', state.studentEmail),
    runPara('Instructor', state.selectedInstructorId || 'Not selected'),
    runPara('Date', new Date().toLocaleString()),
    runPara('SmartChats Level', state.expertiseAfterSmartChats || 'Not available'),
    runPara('Interview Level', state.expertiseAfterInterview || 'Not completed'),
    runPara('Quiz Level', state.expertiseAfterQuiz || 'Not completed'),
    runPara('VR Expertise Level', normalizeReadinessLevel(state.vrExpertiseLevel) || 'Not rated'),
    runPara('VR Report File', d.vrReportFileName || 'Not available'),
    sectionPara('VR Report Summary'),
    p(d.vrSummary || 'No VR report summary generated.'),
    sectionPara('Debriefing Summary'),
    p(d.summary || 'No debriefing summary generated.'),
    sectionPara('Debriefing Conversation'),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
  ]}]});
  return saveDocument({
    title: 'Save Debriefing Report',
    defaultPath: `${safeName(state.studentName)}_debriefing_report.docx`,
    filters: [{ name: 'Word Document', extensions: ['docx'] }]
  }, await Packer.toBuffer(doc));
});


function normalizeReadinessLevel(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('expert') || text.includes('strong')) return 'Expert';
  if (text.includes('intermediate')) return 'Intermediate';
  if (text.includes('basic') || text.includes('needs review') || text.includes('beginner')) return 'Basic';
  return null;
}

// null = not rated (missing, "Not rated", or a VR session without a level): the item leaves the average instead of counting as Basic.
function readinessPoints(value) {
  const level = normalizeReadinessLevel(value);
  if (level === 'Expert') return 3;
  if (level === 'Intermediate') return 2;
  if (level === 'Basic') return 1;
  return null;
}

// Average of the rated items; 2.75 and 1.75 equal the former cut-offs of 11 and 7 points out of four items.
// Pending decision: a certificate is still issued when the VR is not rated (and, later, when vr_validity is inconclusive).
function calculateOverallReadiness(state) {
  const points = [state.expertiseAfterSmartChats, state.expertiseAfterInterview, state.expertiseAfterQuiz, state.vrExpertiseLevel]
    .map(readinessPoints).filter(point => point !== null);
  const average = points.length ? points.reduce((sum, point) => sum + point, 0) / points.length : 0;
  if (average >= 2.75) return 'Expert';
  if (average >= 1.75) return 'Intermediate';
  return 'Basic';
}

function readinessMessage(level) {
  if (level === 'Expert') return 'The participant demonstrated an Expert level of readiness.';
  if (level === 'Intermediate') return 'The participant completed the program with an Intermediate readiness classification. Additional review is recommended to strengthen mastery of advanced concepts.';
  return 'The participant completed the program with a Basic readiness classification. Additional study and practice are recommended before performing complex work-at-height activities independently.';
}

handle('save-certificate', async (_, input) => {
  const state = security.validateEvidence(input, interviewBank, quizBank, true);
  const readiness = calculateOverallReadiness(state);
  const result = await dialog.showSaveDialog({ title: 'Save PDF Certificate',
    defaultPath: `${safeName(state.studentName)}_working_at_height_certificate.pdf`,
    filters: [{ name: 'PDF Certificate', extensions: ['pdf'] }] });
  if (result.canceled || !result.filePath) return { canceled: true };
  const target = security.savePath(result.filePath, app.getAppPath(), '.pdf');
  const data = { name: state.studentName, readiness, qualification: readinessMessage(readiness),
    date: state.debriefing.completedAt ? new Date(state.debriefing.completedAt).toLocaleDateString() : 'Not recorded (legacy session)' };
  const buffer = await require('./certificate-pdf.cjs').createCertificatePDF(data);
  fs.writeFileSync(target, buffer);
  return { canceled: false, filePath: target };
});
