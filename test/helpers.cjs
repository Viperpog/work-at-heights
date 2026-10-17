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
      addEventListener() {}, appendChild() {}, replaceChildren() {},
      setAttribute() {}, removeAttribute() {},
      querySelector() { return null; }
    });
    return elements.get(id);
  };
  const document = {
    getElementById: element, querySelectorAll: () => [],
    querySelector: () => null, createElement: () => element(Symbol())
  };
  const context = vm.createContext({
    document, window: { appApi: api }, console: { warn() {}, error() {}, log() {} },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    alert() {}, setTimeout: () => 0, clearTimeout() {},
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
  const dialog = {
    showSaveDialog: async () => ({ canceled: true }),
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  };
  const electron = {
    app: { getAppPath: () => root, whenReady: () => ({ then() {} }), on() {} },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    dialog, shell: { openExternal: async url => url }, BrowserWindow: function () {}
  };
  const context = vm.createContext({
    require: name => name === 'electron' ? electron : createRequire(path.join(root, 'src/main.js'))(name),
    __dirname: path.join(root, 'src'), process, console, fetch: fetchImpl
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'src/main.js'), 'utf8'), context);
  return { handlers, dialog, run: code => vm.runInContext(code, context) };
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

module.exports = { root, renderer, mainProcess, worker };
