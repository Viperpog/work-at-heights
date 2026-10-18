const { BrowserWindow, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// No preload, privileged bridge, shared session, arbitrary HTML, URL or file path.
async function createCertificatePDF(data) {
  const printSession = session.fromPartition(`wah-certificate-${require('node:crypto').randomUUID()}`);
  const files = { mainFrame: 'certificate.html', script: 'certificate.js', stylesheet: 'certificate.css', font: 'assets/design-v2/Inter.ttf' };
  printSession.webRequest.onBeforeRequest((request, done) => {
    const file = files[request.resourceType];
    done({ cancel: !file || !(Array.isArray(file) ? file : [file]).some(name => request.url === pathToFileURL(path.join(__dirname, name)).href) });
  });
  printSession.setPermissionRequestHandler((_wc, _permission, done) => done(false));
  printSession.setPermissionCheckHandler(() => false);
  const win = new BrowserWindow({ show: false, width: 1123, height: 794, webPreferences: {
    session: printSession, sandbox: true, contextIsolation: true, nodeIntegration: false,
    webSecurity: true, webviewTag: false, allowRunningInsecureContent: false
  } });
  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const event of ['will-navigate', 'will-frame-navigate', 'will-redirect', 'will-attach-webview']) wc.on(event, e => e.preventDefault());
  try {
    await win.loadFile(path.join(__dirname, 'certificate.html'));
    await wc.executeJavaScript(`window.wahCertificate.render(document.querySelector('main'), ${JSON.stringify(data)}); document.fonts.ready.then(() => true)`);
    const fits = await wc.executeJavaScript(`(() => { const r=document.querySelector('main');return r.scrollHeight<=r.clientHeight && r.scrollWidth<=r.clientWidth; })()`);
    if (!fits) throw new Error('Certificate content does not fit the page.');
    return await wc.printToPDF({ pageSize: 'A4', landscape: true, printBackground: true,
      preferCSSPageSize: true, displayHeaderFooter: false, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  } finally {
    win.destroy();
    printSession.webRequest.onBeforeRequest(null);
    await printSession.clearStorageData();
    await printSession.closeAllConnections();
  }
}
module.exports = { createCertificatePDF };
