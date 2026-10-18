// Run after electron-builder on the native Windows/macOS target, never publishes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const product = pkg.build.productName;
const dist = path.join(root, 'dist');
let binary, archive, installer;
if (process.platform === 'win32') {
  binary = path.join(dist, 'win-unpacked', product + '.exe');
  archive = path.join(dist, 'win-unpacked', 'resources', 'app.asar');
  installer = product + ' Setup ' + pkg.version + '.exe';
} else if (process.platform === 'darwin') {
  const suffix = process.arch === 'arm64' ? '-arm64' : '';
  const contents = path.join(dist, 'mac' + suffix, product + '.app', 'Contents');
  binary = path.join(contents, 'MacOS', product);
  archive = path.join(contents, 'Resources', 'app.asar');
  installer = product + '-' + pkg.version + (process.arch === 'arm64' ? '-arm64' : '') + '.dmg';
  const info = require('plist').parse(fs.readFileSync(path.join(contents, 'Info.plist'), 'utf8'));
  assert.ok(Number(String(info.LSMinimumSystemVersion).split('.')[0]) >= 13, 'Mac package must declare macOS 13+');
  console.log(JSON.stringify({ minimumMacOS: info.LSMinimumSystemVersion, microphoneUsageDescriptionPresent: Boolean(info.NSMicrophoneUsageDescription) }));
} else {
  throw new Error('Validate packaging on Windows or macOS using a native target.');
}
assert.ok(fs.statSync(path.join(dist, installer)).size > 0, 'Expected installer is missing');
const version = execFileSync(binary, ['-p', 'process.versions.electron'], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 15000
}).trim();
assert.equal(version, pkg.devDependencies.electron, 'Packaged executable uses the wrong Electron runtime');
const entries = new Set(asar.listPackage(archive).map(name => name.replaceAll('\\', '/')));
assert.ok(![...entries].some(name => name.startsWith('/node_modules/pdf-lib/')), 'Test-only PDF parser must not ship');
assert.ok(![...entries].some(name => name.startsWith('/docs/debriefing-pdf/')), 'Synthetic review artifacts must not ship');
assert.ok(![...entries].some(name => name.startsWith('/docs/final-welcome/')), 'Welcome comparison artifacts must not ship');
for (const file of ['src/main.js', 'src/preload.js', 'src/renderer.js', 'src/dialogs.js', 'src/certificate.js', 'src/certificate.css', 'src/certificate.html', 'src/certificate-pdf.cjs', 'src/security.cjs', 'src/styles.css',
  'src/services.cjs', 'src/index.html', 'data/question-bank.json', 'data/final-quiz-bank.json',
  'node_modules/papaparse/papaparse.min.js', 'docs/NR35_Revised_Professional_Ebook_Combined.docx',
  ...['jake-miller', 'emily-carter', 'carlos-rivera', 'beatrice-johnson'].map(name => 'src/assets/instructors/' + name + '.png'),
  ...['welcome-training.png', 'orientation-safety.png', 'gear.svg', 'book.svg', 'voice.svg', 'mute.svg', 'microphone.svg', 'Inter.ttf', 'Inter-OFL.txt'].map(name => 'src/assets/design-v2/' + name)]) {
  assert.ok(entries.has('/' + file), 'Missing packaged file: ' + file);
  assert.ok(asar.extractFile(archive, path.normalize(file)).equals(fs.readFileSync(path.join(root, file))), 'Packaged file differs: ' + file);
}
console.log(JSON.stringify({ installer, electron: version, platform: process.platform, arch: process.arch, archive: 'contents verified' }));
