// Explicit opt-in: sends synthetic requests to the configured live services.
// Not part of npm test. May consume provider resources. Never logs response content/audio.
const path = require('node:path');
if (!process.argv.includes('--live')) {
  console.error('Opt in explicitly: node test/probe-integrations.cjs --live');
  process.exit(1);
}
const { loadServiceConfig } = require('../src/services.cjs');
const config = loadServiceConfig(path.join(__dirname, '..'));
const chat = config.chatEndpoint;
const voice = config.voiceEndpoint;
const wav = Buffer.alloc(44 + 16000 * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
wav.writeUInt32LE(wav.length - 44, 40);
const probes = [
  ['chat', chat, { messages: [{ role: 'user', content: 'Synthetic integration test. Reply only OK.' }], maxTokens: 10 }, data => typeof data.content === 'string' && data.content.length > 0],
  ['tts', voice, { action: 'tts', text: 'Synthetic test.' }, data => typeof data.audioBase64 === 'string' && data.audioBase64.length > 0 && typeof data.mimeType === 'string'],
  ['transcribe', voice, { action: 'transcribe', audioBase64: wav.toString('base64'), mimeType: 'audio/wav', fileName: 'synthetic-silence.wav' }, data => typeof data.text === 'string']
];
(async () => {
  let failures = 0;
  for (const [name, url, body, validate] of probes) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = name === 'chat' ? config.chatAuthToken : config.voiceAuthToken;
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(config.requestTimeoutMs), redirect: 'error' });
      const data = await response.json();
      const compatible = response.ok && validate(data);
      if (!compatible) failures++;
      console.log(JSON.stringify({ name, status: response.status, compatible, fields: Object.keys(data) }));
    } catch (error) {
      failures++;
      console.log(JSON.stringify({ name, error: error.cause?.code || error.name }));
    }
  }
  process.exitCode = failures ? 1 : 0;
})();
