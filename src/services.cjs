const fs = require('node:fs');
const path = require('node:path');

const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const MAX_MESSAGES_CHARS = 300000;

function endpoint(value, name) {
  let url;
  try { url = new URL(value); } catch (_) { throw new Error(`Invalid ${name} configuration.`); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.hash) {
    throw new Error(`Invalid ${name} configuration. Use HTTPS or loopback HTTP without credentials.`);
  }
  return url.href;
}

function loadServiceConfig(appPath, env = process.env) {
  const defaults = JSON.parse(fs.readFileSync(path.join(appPath, 'data/config.json'), 'utf8'));
  let privateConfig = {};
  if (env.WAH_CONFIG_FILE) {
    try { privateConfig = JSON.parse(fs.readFileSync(env.WAH_CONFIG_FILE, 'utf8')); }
    catch (_) { throw new Error('Unable to load WAH_CONFIG_FILE. Check its JSON configuration.'); }
    if (!privateConfig || typeof privateConfig !== 'object' || Array.isArray(privateConfig)) throw new Error('Invalid WAH_CONFIG_FILE configuration.');
  }
  const timeoutMs = Number(env.WAH_REQUEST_TIMEOUT_MS || privateConfig.requestTimeoutMs || defaults.requestTimeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 180000) throw new Error('requestTimeoutMs must be between 100 and 180000.');
  const tokens = [env.WAH_CHAT_AUTH_TOKEN || privateConfig.chatAuthToken, env.WAH_VOICE_AUTH_TOKEN || privateConfig.voiceAuthToken];
  if (tokens.some(token => token !== undefined && (typeof token !== 'string' || token.length > 512 || /[\r\n]/.test(token)))) throw new Error('Invalid service authentication configuration.');
  return Object.freeze({
    chatEndpoint: endpoint(env.WAH_CHAT_ENDPOINT || privateConfig.chatEndpoint || defaults.apiEndpoint, 'chat endpoint'),
    voiceEndpoint: endpoint(env.WAH_VOICE_ENDPOINT || privateConfig.voiceEndpoint || defaults.voiceEndpoint, 'voice endpoint'),
    requestTimeoutMs: timeoutMs,
    chatAuthToken: tokens[0], voiceAuthToken: tokens[1],
    // This is the ONLY configuration returned to renderer code.
    rendererConfig: Object.freeze({
      maxTokens: defaults.maxTokens,
      useLocalFallbackWhenApiFails: defaults.useLocalFallbackWhenApiFails
    })
  });
}

function validBase64(value) {
  return typeof value === 'string' && value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function chatPayload(payload) {
  if (!payload || !Array.isArray(payload.messages) || !payload.messages.length || payload.messages.length > 100) throw new Error('Invalid chat messages.');
  let length = 0;
  for (const message of payload.messages) {
    if (!message || !['system', 'developer', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim()) throw new Error('Invalid chat message.');
    length += message.content.length;
  }
  if (length > MAX_MESSAGES_CHARS) throw new Error('Chat request is too large.');
  const maxTokens = payload.maxTokens ?? 1200;
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4096) throw new Error('Invalid chat token limit.');
  // Preserve all roles and conversation content; do not insert a provider/persona.
  return { messages: payload.messages.map(({ role, content }) => ({ role, content })), maxTokens };
}

async function readJson(response) {
  if (Number(response.headers?.get('content-length')) > MAX_RESPONSE_BYTES) throw new Error('Oversized response');
  let text;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('Oversized response'); }
        chunks.push(Buffer.from(part.value));
      }
    } finally { reader.releaseLock(); }
    text = Buffer.concat(chunks).toString('utf8');
  } else {
    text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error('Oversized response');
  }
  return JSON.parse(text);
}

function createServiceClient(config, { fetchImpl = globalThis.fetch } = {}) {
  async function request(kind, body, normalize) {
    const controller = new AbortController();
    let timer;
    const label = { chat: 'Chat', transcribe: 'Transcription', tts: 'Speech' }[kind];
    const token = kind === 'chat' ? config.chatAuthToken : config.voiceAuthToken;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`${label} service timed out. Please retry.`));
      }, config.requestTimeoutMs);
    });
    const operation = (async () => {
      let response;
      try {
        response = await fetchImpl(kind === 'chat' ? config.chatEndpoint : config.voiceEndpoint, {
          method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal,
          redirect: 'error' // Never forward proxy authentication to a redirect destination.
        });
      } catch (_) {
        throw new Error(`${label} service is unavailable. Please retry.`);
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new Error(`${label} service returned HTTP ${response.status}. Please retry.`);
      }
      try {
        const data = await readJson(response);
        if (!data || typeof data !== 'object' || Array.isArray(data) || data.error) throw new Error('Invalid response');
        return normalize(data);
      } catch (_) { throw new Error(`${label} service returned an invalid response. Please retry.`); }
    })();
    try { return await Promise.race([operation, timeout]); }
    finally { clearTimeout(timer); controller.abort(); }
  }

  return {
    chat(payload) {
      return request('chat', chatPayload(payload), data => {
        const content = data.content ?? data.result;
        if (typeof content !== 'string' || !content.trim()) throw new Error('Missing content');
        return content;
      });
    },
    transcribe(payload) {
      if (!payload || !validBase64(payload.audioBase64)) throw new Error('No audio or invalid audio received for transcription.');
      if (payload.audioBase64.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4) throw new Error('Audio request is too large.');
      const mimeType = payload.mimeType || 'audio/webm';
      if (typeof mimeType !== 'string' || !/^audio\/(webm|ogg|mp4|mpeg|wav|x-wav)(;codecs=[\w.-]+)?$/.test(mimeType)) throw new Error('Unsupported audio type.');
      const fileName = payload.fileName || 'interview-answer.webm';
      if (typeof fileName !== 'string' || fileName.length > 120 || /[\\/\r\n]/.test(fileName)) throw new Error('Invalid audio filename.');
      return request('transcribe', { action: 'transcribe', audioBase64: payload.audioBase64, mimeType, fileName }, data => {
        const text = data.text ?? data.transcript ?? data.content;
        if (typeof text !== 'string') throw new Error('Missing transcript');
        return { text };
      });
    },
    speech(payload) {
      const text = payload?.text;
      if (typeof text !== 'string' || !text.trim()) throw new Error('No text received for speech synthesis.');
      if (text.length > 16000) throw new Error('Speech request is too large.');
      const body = {
        action: 'tts', text: text.trim(), voice: payload.voice || 'cedar', model: payload.model || 'gpt-4o-mini-tts',
        instructions: payload.instructions || 'Speak naturally as a warm, experienced senior safety instructor. Use a clear professional tone, moderate pace, and supportive intonation.'
      };
      if (typeof body.voice !== 'string' || body.voice.length > 80 || typeof body.model !== 'string' || body.model.length > 100 || typeof body.instructions !== 'string' || body.instructions.length > 4000) throw new Error('Invalid speech options.');
      return request('tts', body, data => {
        if (!validBase64(data.audioBase64) || (data.mimeType !== undefined && data.mimeType !== 'audio/mpeg')) throw new Error('Invalid audio response');
        return { audioBase64: data.audioBase64, mimeType: data.mimeType || 'audio/mpeg' };
      });
    }
  };
}

module.exports = { loadServiceConfig, createServiceClient, chatPayload, validBase64 };
