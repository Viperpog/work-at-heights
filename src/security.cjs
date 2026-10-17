const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { inflateRawSync } = require('node:zlib');

function reject(message = 'Invalid document evidence.') { throw new Error(message); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function text(value, max = 32000) { return typeof value === 'string' && value.length <= max; }
function sameValue(a, b) {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  return object(a) && object(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}
function xmlText(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}

function trustedSender(event, windows, documentURL) {
  const contents = event?.sender;
  const frame = event?.senderFrame;
  return Boolean(contents && windows.has(contents) && !contents.isDestroyed() && frame
    && frame === contents.mainFrame && frame.parent === null && frame.url === documentURL && contents.getURL() === documentURL);
}

function resourceAllowed(url, type, appPath) {
  if (type === 'media' && url.startsWith('blob:')) return true;
  const relative = {
    mainFrame: ['src/index.html'], script: ['src/renderer.js', 'node_modules/papaparse/papaparse.min.js'],
    stylesheet: ['src/styles.css'],
    image: ['src/assets/logo.png', 'src/assets/wah-hero.png', ...['jake-miller', 'emily-carter', 'carlos-rivera', 'beatrice-johnson'].map(name => 'src/assets/instructors/' + name + '.png')]
  }[type] || [];
  return relative.some(file => pathToFileURL(path.join(appPath, file)).href === url);
}

function externalURL(value) {
  if (!text(value, 2048) || /[\u0000-\u0020\\]/.test(value)) reject('External URL is not allowed.');
  let url;
  try { url = new URL(value); } catch (_) { reject('External URL is not allowed.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'smartchats.info' || url.port || url.username || url.password
    || url.pathname !== '/course/whs' || url.hash) reject('External URL is not allowed.');
  // Preserve the current SmartChats correlation query; do not accept arbitrary redirect parameters.
  let email;
  try { email = decodeURIComponent(url.search.slice(2)); } catch (_) { reject('External URL is not allowed.'); }
  if (url.search && (!url.search.startsWith('?=') || /[&;]/.test(url.search) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) reject('External URL is not allowed.');
  return url.href;
}

function inside(file, directory) {
  const relative = path.relative(directory, file);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function savePath(value, appPath) {
  if (!text(value, 4096) || !path.isAbsolute(value) || path.extname(value).toLowerCase() !== '.docx' || /[\u0000-\u001F]/.test(value)) reject('Choose a Word document destination.');
  const target = path.resolve(value);
  const parent = fs.realpathSync(path.dirname(target));
  if (inside(target, appPath) || inside(path.join(parent, path.basename(target)), fs.realpathSync(appPath))) reject('Cannot overwrite application files.');
  if (fs.existsSync(target) && !fs.lstatSync(target).isFile()) reject('Destination must be a regular file.');
  return target;
}

function validateZip(buffer) {
  if (buffer.length < 22 || buffer.length > 8 * 1024 * 1024) reject('Invalid or oversized Word report.');
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > buffer.length || end + 22 + buffer.readUInt16LE(end + 20) !== buffer.length) reject('Invalid Word archive.');
  const count = buffer.readUInt16LE(end + 10), start = buffer.readUInt32LE(end + 16), size = buffer.readUInt32LE(end + 12);
  if (buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6) || count < 1 || count > 1000 || start + size !== end) reject('Unsupported Word archive.');
  let cursor = start, total = 0;
  const names = new Set();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) reject('Invalid Word archive.');
    const flags = buffer.readUInt16LE(cursor + 8), method = buffer.readUInt16LE(cursor + 10);
    const compressed = buffer.readUInt32LE(cursor + 20), uncompressed = buffer.readUInt32LE(cursor + 24);
    const nameSize = buffer.readUInt16LE(cursor + 28), extra = buffer.readUInt16LE(cursor + 30), comment = buffer.readUInt16LE(cursor + 32), local = buffer.readUInt32LE(cursor + 42);
    if (cursor + 46 + nameSize + extra + comment > end) reject('Invalid Word archive.');
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameSize).toString('utf8');
    if (names.has(name) || /(^|\/)\.\.(\/|$)|^[\/]|[\\\u0000]/.test(name) || /vbaProject\.bin$/i.test(name)
      || (flags & 1) || ![0, 8].includes(method) || uncompressed > 8 * 1024 * 1024 || local + 30 > start || buffer.readUInt32LE(local) !== 0x04034b50) reject('Unsupported Word archive.');
    names.add(name);
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    if (dataStart + compressed > start) reject('Invalid Word archive.');
    const data = buffer.subarray(dataStart, dataStart + compressed);
    let inflated;
    try { inflated = method === 8 ? inflateRawSync(data, { maxOutputLength: 8 * 1024 * 1024 }) : data; }
    catch (_) { reject('Invalid or oversized Word content.'); }
    total += inflated.length;
    if (inflated.length !== uncompressed || total > 32 * 1024 * 1024) reject('Oversized Word content.');
    if (name.endsWith('.xml') && /<!DOCTYPE|<!ENTITY/i.test(inflated.toString('utf8'))) reject('Unsupported XML declarations.');
    cursor += 46 + nameSize + extra + comment;
  }
  if (cursor !== end || !names.has('[Content_Types].xml') || !names.has('word/document.xml')) reject('A valid Word report is required.');
}

async function readReport(filePath, extract) {
  if (!text(filePath, 4096) || !path.isAbsolute(filePath) || path.extname(filePath).toLowerCase() !== '.docx') reject('Select a Word report.');
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.size > 8 * 1024 * 1024) reject('Invalid or oversized Word report.');
  const buffer = fs.readFileSync(filePath);
  validateZip(buffer);
  let extracted;
  try { extracted = await extract({ buffer }); } catch (_) { reject('Unable to read the Word report.'); }
  if (!text(extracted.value, 500000)) reject('Word report text exceeds supported limits.');
  // Empty valid DOCX remains allowed: changing this would alter current completion rules.
  return { canceled: false, fileName: path.basename(filePath), text: xmlText(extracted.value) };
}

function normalizeState(input) {
  let count = 0;
  function check(value, depth, key) {
    if (++count > 15000 || depth > 20) reject('Document evidence is too complex.');
    if (typeof value === 'string') { if (!text(value, key === 'vrReportText' ? 500000 : 32000)) reject('Document text exceeds supported limits.'); }
    else if (Array.isArray(value)) { if (value.length > 1000) reject(); for (const item of value) check(item, depth + 1, key); }
    else if (object(value)) {
      for (const [name, item] of Object.entries(value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(name)) reject();
        check(item, depth + 1, name);
      }
    } else if (value !== null && !['boolean', 'number', 'undefined'].includes(typeof value)) reject();
    if (typeof value === 'number' && !Number.isFinite(value)) reject();
  }
  if (!object(input)) reject();
  check(input, 0, '');
  let serialized;
  try { serialized = JSON.stringify(input); } catch (_) { reject(); }
  if (Buffer.byteLength(serialized) > 2 * 1024 * 1024) reject('Document evidence is too large.');
  const state = JSON.parse(serialized, (_key, value) => typeof value === 'string' ? xmlText(value) : value);
  if (!text(state.studentName, 200) || state.studentName.trim().length < 2 || !text(state.studentEmail, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.studentEmail)) reject('Valid learner details are required.');
  if (state.selectedInstructorId !== undefined && !['jake', 'emily', 'carlos', 'beatrice'].includes(state.selectedInstructorId)) reject('Invalid instructor.');
  for (const key of ['interview', 'quiz', 'debriefing']) if (!object(state[key]) || !Array.isArray(state[key].history)) reject();
  for (const key of ['expertiseAfterSmartChats', 'expertiseAfterInterview', 'expertiseAfterQuiz', 'vrExpertiseLevel', 'smartSummary']) if (state[key] !== undefined && state[key] !== null && !text(state[key])) reject();
  for (const key of ['interview', 'quiz', 'debriefing']) for (const field of ['summary', 'vrSummary', 'vrReportText', 'vrReportFileName', 'vrMessage']) {
    if (state[key][field] !== undefined && !text(state[key][field], field === 'vrReportText' ? 500000 : 32000)) reject();
  }
  for (const key of ['interview', 'quiz']) if (state[key].history.length > 24 || (state[key].recommendations !== undefined && (!Array.isArray(state[key].recommendations) || state[key].recommendations.some(r => !object(r) || !Number.isInteger(r.module) || !text(r.chapter) || !text(r.topic))))) reject();
  if (state.debriefing.history.length > 50 || state.debriefing.history.some(h => !object(h) || !['user', 'interviewer'].includes(h.role) || !text(h.text))) reject();
  return state;
}

function validateEvidence(input, interviewBank, quizBank, certificate = false) {
  const state = normalizeState(input);
  for (const [key, bank] of [['interview', interviewBank], ['quiz', quizBank]]) {
    for (const entry of state[key].history) {
      const q = bank.find(q => q.id === entry?.question?.id);
      if (!q || !sameValue(q, entry.question)) reject('Assessment question evidence does not match the training bank.');
      if (key === 'interview') {
        const e = entry.evaluation;
        if (!object(e) || typeof e.score !== 'number' || e.score < 0 || e.score > q.maxScore || typeof e.isCorrect !== 'boolean' || !['Correct', 'Partially Correct', 'Incorrect', 'Skipped'].includes(e.correctness)
          || (e.isCorrect && e.correctness !== 'Correct') || !text(entry.answer) || typeof entry.skipped !== 'boolean' || (entry.skipped && (e.score !== 0 || e.isCorrect))) reject('Invalid interview evidence.');
      } else {
        if (!Number.isInteger(entry.selectedIndex) || entry.selectedIndex < 0 || entry.selectedIndex >= q.options.length || entry.correct !== (entry.selectedIndex === q.correctIndex)
          || entry.earnedPoints !== (entry.correct ? q.points : 0) || entry.selectedText !== q.options[entry.selectedIndex] || entry.correctText !== q.options[q.correctIndex]) reject('Invalid quiz evidence.');
      }
    }
  }
  if (!certificate) return state;
  if (!['smartchatsCompleted', 'interviewCompleted', 'quizCompleted', 'vrCompleted', 'debriefingCompleted'].every(key => state[key] === true)) reject('Complete the existing training stages before generating a certificate.');
  if (!['Basic', 'Intermediate', 'Expert'].includes(state.expertiseAfterSmartChats)) reject('Missing SmartChats classification.');
  for (const kind of ['interview', 'quiz']) {
    const history = state[kind].history;
    if (!history.length || ![1,2,3,4,5,6,7,8].every(module => history.some(h => h.question.module === module))) reject('Missing assessment completion evidence.');
    let module = 1;
    let difficulty = state[kind === 'interview' ? 'expertiseAfterSmartChats' : 'expertiseAfterInterview']?.toLowerCase();
    for (const h of history) {
      if (h.question.module !== module || h.question.difficulty !== difficulty) reject('Assessment sequence does not match the existing adaptive progression.');
      const correct = kind === 'interview' ? h.evaluation.isCorrect : h.correct;
      if (kind === 'quiz' && module === 5 && difficulty !== 'expert') difficulty = difficulty === 'basic' && correct ? 'intermediate' : 'expert';
      else if (correct && difficulty !== 'expert') difficulty = difficulty === 'basic' ? 'intermediate' : 'expert';
      else { module++; difficulty = correct ? 'expert' : 'basic'; }
    }
    if (module !== 9) reject('Assessment is not complete.');
    const earned = history.reduce((sum, h) => sum + (kind === 'interview' ? h.evaluation.score : h.earnedPoints), 0);
    const possible = history.reduce((sum, h) => sum + (kind === 'interview' ? h.question.maxScore : h.question.points), 0);
    const pct = possible ? Math.round(earned / possible * 100) : 0;
    const level = kind === 'quiz' ? (pct < 50 ? 'Basic' : pct < 85 ? 'Intermediate' : 'Expert')
      : history.filter(h => h.question.difficulty === 'expert' && h.evaluation.isCorrect).length >= 4 && pct >= 75 ? 'Expert'
        : history.filter(h => h.question.difficulty === 'intermediate' && h.evaluation.isCorrect).length >= 3 && pct >= 55 ? 'Intermediate' : 'Basic';
    if (state[kind + 'Score'] !== `${earned}/${possible} (${pct}%)` || state[kind === 'quiz' ? 'expertiseAfterQuiz' : 'expertiseAfterInterview'] !== level) reject('Assessment totals or classification do not match the evidence.');
  }
  if (!text(state.vrExpertiseLevel, 80) || !text(state.debriefing.vrReportFileName, 255)
    || !state.debriefing.history.some(h => h.role === 'user') || !state.debriefing.history.some(h => h.role === 'interviewer')) reject('Missing VR or debriefing completion evidence.');
  return state;
}

module.exports = { trustedSender, resourceAllowed, externalURL, savePath, validateZip, readReport, validateEvidence, xmlText, pathToFileURL };
