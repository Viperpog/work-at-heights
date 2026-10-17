const fs = require('node:fs');
const path = require('node:path');
const { validBase64 } = require('../../src/services.cjs');
function audioPayload(value) {
  const extensions = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a' };
  if (!value || Object.keys(value).some(key => !['audioBase64', 'mimeType'].includes(key))
    || !validBase64(value.audioBase64) || value.audioBase64.length > Math.ceil(16 * 1024 * 1024 / 3) * 4
    || typeof value.mimeType !== 'string' || !/^audio\/(webm|ogg|mp4)(;codecs=[\w.-]+)?$/.test(value.mimeType)) throw new Error('Invalid diagnostic audio.');
  return { ...value, fileName: `wah-microphone.${extensions[value.mimeType.split(';')[0]]}` };
}
function exportPath(value, extension, root) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\x00-\x1f]/.test(value)
    || path.extname(value).toLowerCase() !== '.' + extension) throw new Error('Choose a matching audio filename.');
  const target = path.join(fs.realpathSync(path.dirname(value)), path.basename(value));
  const relative = path.relative(fs.realpathSync(root), target);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Cannot write into the application.');
  if (fs.existsSync(target)) throw new Error('Choose a new filename; existing files are never overwritten.');
  return target;
}
module.exports = { audioPayload, exportPath };
