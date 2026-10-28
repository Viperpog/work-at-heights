const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');

// Execute the real renderer, suppressing only its final automatic startup call.
// DOM/storage/network boundaries are doubles; this is not a browser/Electron test.
function renderer(api = {}) {
  const elements = new Map();
  const storage = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', innerHTML: '', disabled: false, dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      children: [],
      addEventListener() {},
      appendChild(child) { this.children.push(child); return child; },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      get firstChild() { return this.children[0]; },
      setAttribute() {}, removeAttribute() {},
      querySelector() { return null; }
    });
    return elements.get(id);
  };
  const document = {
    getElementById: element, querySelectorAll: () => [],
    querySelector: selector => selector.startsWith('.tabs button[data-tab=') ? element(selector) : null,
    createElement: tag => Object.assign(element(Symbol()), { tagName: tag.toUpperCase() }), createTextNode: text => ({ textContent: String(text) })
  };
  const context = vm.createContext({
    document, window: { appApi: api, wahCertificate: { render() {} }, wahDialogs: {
      showInfo: async () => 'primary', showConfirm: async () => 'primary', showSessionRecovery: async () => 'primary'
    } }, console: { warn() {}, error() {}, log() {} },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    alert() {}, performance, setTimeout: () => 0, clearTimeout() {},
    fetch: () => { throw new Error('Unexpected network request in unit test'); }
  });
  const source = fs.readFileSync(path.join(root, 'src/renderer.js'), 'utf8');
  if (!/\binit\(\);\s*$/.test(source)) throw new Error('Renderer bootstrap changed; review harness');
  vm.runInContext(source.replace(/\binit\(\);\s*$/, ''), context);
  return {
    run: code => vm.runInContext(code, context),
    json: code => JSON.parse(JSON.stringify(vm.runInContext(code, context))),
    context, elements, element, storage, document
  };
}

function mainProcess(fetchImpl = () => { throw new Error('Unexpected network request'); }) {
  const handlers = new Map();
  const rawHandlers = new Map();
  const events = new Map();
  const sent = [];
  const contents = {
    isDestroyed: () => false, send: (channel, payload) => sent.push([channel, payload]),
    getURL: () => require('node:url').pathToFileURL(path.join(root, 'src/index.html')).href,
    on: (name, fn) => events.set(name, fn), once: (name, fn) => events.set(name, fn),
    setWindowOpenHandler: fn => events.set('window-open', fn),
    session: {
      setPermissionRequestHandler: fn => events.set('permission-request', fn),
      setPermissionCheckHandler: fn => events.set('permission-check', fn),
      webRequest: { onBeforeRequest: fn => events.set('resource', fn) }
    }
  };
  contents.mainFrame = { parent: null, url: contents.getURL() };
  const event = { sender: contents, senderFrame: contents.mainFrame };
  const dialog = {
    showSaveDialog: async () => ({ canceled: true }),
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  };
  const electron = {
    app: { getAppPath: () => root, whenReady: () => ({ then: fn => fn() }), on() {} },
    ipcMain: { handle: (name, handler) => { rawHandlers.set(name, handler); handlers.set(name, (e, ...args) => handler(e ?? event, ...args)); } },
    dialog, shell: { openExternal: async url => url }, BrowserWindow: function (options) { this.webContents = contents; this.loadFile = () => {}; events.set('window-options', options); }
  };
  const context = vm.createContext({
    require: name => name === 'electron' ? electron : createRequire(path.join(root, 'src/main.js'))(name),
    __dirname: path.join(root, 'src'), process, console, fetch: fetchImpl
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'src/main.js'), 'utf8'), context);
  return { handlers, rawHandlers, dialog, events, event, contents, sent, run: code => vm.runInContext(code, context) };
}

function completedState(smartLevel = 'Basic') {
  const h = renderer();
  h.context.interviewData = JSON.parse(fs.readFileSync(path.join(root, 'data/question-bank.json')));
  h.context.quizData = JSON.parse(fs.readFileSync(path.join(root, 'data/final-quiz-bank.json')));
  h.context.smartLevel = smartLevel;
  h.run(`state.studentName='Synthetic Learner'; state.studentEmail='learner@example.invalid'; state.orientationCompleted=true;
    state.smartchatsCompleted=true; state.smartQuestionCount=1; state.expertiseAfterSmartChats=smartLevel;
    for(let module=1;module<=8;module++) {
      const q=interviewData.find(q=>q.module===module && q.difficulty===(module===1?smartLevel.toLowerCase():'basic'));
      state.interview.history.push({question:q,answer:'I do not know',skipped:true,evaluation:localEvaluate(q,'',true)});
    }
    finishInterview();
    let module=1,level='basic';
    while(module<=8) {
      const q=quizData.find(q=>q.module===module && q.difficulty===level);
      state.quiz.history.push({question:q,selectedIndex:q.correctIndex,selectedText:q.options[q.correctIndex],correctText:q.options[q.correctIndex],correct:true,earnedPoints:q.points});
      const next=advanceQuiz(true,q); module=next.module;level=next.level;
    }
    state.quiz.module5ExpertEncountered=true; finishQuizAdaptive();
    state.vrCompleted=true; state.vrExpertiseLevel='Intermediate';
    state.debriefing.vrReportFileName='synthetic.docx';state.debriefing.vrReportText='Synthetic VR report';
    state.debriefing.history=[{role:'interviewer',text:'Synthetic follow-up'},{role:'user',text:'Synthetic reflection'}];
    state.debriefingCompleted=true;`);
  return h.json('state');
}

function worker(relativePath, upstream, timers = {}) {
  const context = vm.createContext({
    Request, Response, Headers, FormData, Blob, atob, btoa, Uint8Array,
    TextDecoder, AbortController, setTimeout, clearTimeout, ...timers,
    fetch: upstream || (() => { throw new Error('Unexpected upstream request'); })
  });
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  // Bundle the single local shared module in memory; no duplicated Worker logic.
  const common = fs.readFileSync(path.join(root, 'src/worker-common.mjs'), 'utf8').replace(/^export /gm, '');
  vm.runInContext(common + '\n' + source.replace(/^import .*;\r?\n/m, '').replace('export default', 'globalThis.worker ='), context);
  return context.worker;
}

module.exports = { root, renderer, mainProcess, completedState, worker };
