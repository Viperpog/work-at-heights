// Separate development entry point: never loaded by the packaged learner app.
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const security = require('../../src/security.cjs');
const { loadServiceConfig, createServiceClient } = require('../../src/services.cjs');
const { audioPayload, exportPath } = require('./validation.cjs');
const root = path.resolve(__dirname, '../..');
const documentURL = security.pathToFileURL(path.join(__dirname, 'index.html')).href;
const windows = new Set();
if (app.isPackaged) throw new Error('Microphone diagnostic is development-only.');
app.setAppPath(root);
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'wah-microphone-')));
const service = createServiceClient(loadServiceConfig(root));
for (const [channel, operation] of Object.entries({
  'diagnostic-transcribe': payload => service.transcribe(audioPayload(payload)),
  'diagnostic-export': async payload => {
    const audio = audioPayload(payload);
    const extension = audio.fileName.split('.').pop();
    const result = await dialog.showSaveDialog({ title: 'Save diagnostic recording', defaultPath: audio.fileName,
      filters: [{ name: 'Recorded audio', extensions: [extension] }] });
    if (result.canceled || !result.filePath) return { canceled: true };
    const target = exportPath(result.filePath, extension, root);
    fs.writeFileSync(target, Buffer.from(audio.audioBase64, 'base64'), { flag: 'wx' });
    return { canceled: false, filePath: target };
  }
})) ipcMain.handle(channel, (event, ...args) => {
  if (!security.trustedSender(event, windows, documentURL) || args.length !== 1) throw new Error('Untrusted or invalid diagnostic request.');
  return operation(args[0]);
});
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 980, height: 850, webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true,
    nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
    webSecurity: true, webviewTag: false, allowRunningInsecureContent: false
  } });
  const wc = win.webContents;
  windows.add(wc); wc.once('destroyed', () => windows.delete(wc));
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (event, url) => { if (url !== documentURL) event.preventDefault(); });
  wc.on('will-frame-navigate', event => { if (!event.isMainFrame || event.url !== documentURL) event.preventDefault(); });
  wc.on('will-redirect', event => event.preventDefault());
  wc.on('will-attach-webview', event => event.preventDefault());
  const resources = { mainFrame: 'index.html', script: 'renderer.js', stylesheet: 'styles.css' };
  wc.session.webRequest.onBeforeRequest((request, done) => done({ cancel: !(request.resourceType === 'media' && request.url.startsWith('blob:'))
    && request.url !== (resources[request.resourceType] && security.pathToFileURL(path.join(__dirname, resources[request.resourceType])).href) }));
  const allowed = (contents, permission, details) => windows.has(contents) && contents.getURL() === documentURL
    && permission === 'media' && details?.requestingUrl === documentURL && details.isMainFrame === true;
  wc.session.setPermissionRequestHandler((contents, permission, done, details) => done(Boolean(allowed(contents, permission, details)
    && details.mediaTypes?.length && details.mediaTypes.every(type => type === 'audio'))));
  wc.session.setPermissionCheckHandler((contents, permission, _origin, details) => Boolean(allowed(contents, permission, details) && details.mediaType === 'audio'));
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
