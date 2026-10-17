const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { audioPayload, exportPath } = require('../dev/microphone/validation.cjs');
test('diagnostic audio validation allows recorder formats and derives filenames', () => {
  for (const [mimeType, extension] of [['audio/webm;codecs=opus','webm'],['audio/ogg;codecs=opus','ogg'],['audio/mp4','m4a']]) {
    assert.equal(audioPayload({ audioBase64: 'AAAA', mimeType }).fileName, 'wah-microphone.' + extension);
  }
});
test('diagnostic rejects malformed, oversized and unexpected IPC payloads', () => {
  for (const value of [null, {}, { audioBase64: '!', mimeType: 'audio/webm' }, { audioBase64:'AAAA',mimeType:'text/html' },
    { audioBase64:'AAAA',mimeType:'audio/webm',filePath:'arbitrary' }, { audioBase64:'A'.repeat(24*1024*1024),mimeType:'audio/webm' }]) assert.throws(() => audioPayload(value));
});
test('audio export rejects application paths, overwrites, invalid extensions and symlinked parents', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),'wah-audio-path-'));
  try {
    const root=path.join(temporary,'app');fs.mkdirSync(root);const existing=path.join(temporary,'existing.webm');fs.writeFileSync(existing,'keep');
    assert.equal(exportPath(path.join(temporary,'new.webm'),'webm',root),path.join(temporary,'new.webm'));
    for(const file of [path.join(root,'bad.webm'),existing,path.join(temporary,'bad.exe'),'relative.webm']) assert.throws(()=>exportPath(file,'webm',root));
    const link=path.join(temporary,'link');fs.symlinkSync(root,link,process.platform==='win32'?'junction':'dir');
    assert.throws(()=>exportPath(path.join(link,'bad.webm'),'webm',root));
    assert.equal(fs.readFileSync(existing,'utf8'),'keep');
  } finally { fs.rmSync(temporary,{recursive:true,force:true}); }
});
