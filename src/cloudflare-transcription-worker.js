import { RequestError, workerBoundary, normalizeChat, upstreamJson, upstream, chatContent, base64Bytes, toBase64, limitedBytes } from './worker-common.mjs';

export default workerBoundary(async (body, env) => {
  const action = body.action ?? 'chat';
  if (!['chat', 'transcribe', 'tts'].includes(action)) throw new RequestError(400, 'Unsupported action.');
  if (action === 'chat') {
    const payload = normalizeChat(body);
    requireKey(env);
    const data = await upstreamJson('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: auth(env),
      body: JSON.stringify({ model: env.OPENAI_CHAT_MODEL || 'gpt-4o-mini', ...payload })
    });
    return { content: chatContent(data) };
  }
  if (action === 'transcribe') {
    const bytes = base64Bytes(body.audioBase64);
    const mimeType = body.mimeType || 'audio/webm';
    if (typeof mimeType !== 'string' || !/^audio\/(webm|ogg|mp4|mpeg|wav|x-wav)(;codecs=[\w.-]+)?$/.test(mimeType)) throw new RequestError(400, 'Unsupported audio type.');
    const extension = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : mimeType.includes('wav') ? 'wav' : mimeType.includes('mpeg') ? 'mp3' : 'webm';
    const fileName = body.fileName || `interview-answer.${extension}`;
    if (typeof fileName !== 'string' || fileName.length > 120 || /[\\/\r\n]/.test(fileName)) throw new RequestError(400, 'Invalid audio filename.');
    requireKey(env);
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mimeType }), fileName);
    form.append('model', env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1');
    form.append('language', 'en');
    const data = await upstreamJson('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form
    });
    if (typeof data.text !== 'string') throw new RequestError(502, 'Invalid upstream transcription.', 'UPSTREAM_FAILURE');
    return { text: data.text };
  }
  if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 16000) throw new RequestError(400, 'Invalid speech text.');
  const model = body.model || env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
  const voice = body.voice || env.OPENAI_TTS_VOICE || 'cedar';
  const instructions = body.instructions || env.OPENAI_TTS_INSTRUCTIONS || 'Speak naturally as a warm, experienced senior safety instructor. Use a clear professional tone, moderate pace, supportive intonation, and avoid sounding robotic.';
  if (typeof model !== 'string' || !model.length || model.length > 100 || typeof voice !== 'string' || !voice.length || voice.length > 80 || typeof instructions !== 'string' || instructions.length > 4000) throw new RequestError(400, 'Invalid speech options.');
  if (env.ALLOWED_TTS_MODELS && !env.ALLOWED_TTS_MODELS.split(',').map(value => value.trim()).includes(model)) throw new RequestError(400, 'Speech model is not allowed.');
  requireKey(env);
  const bytes = await upstream('https://api.openai.com/v1/audio/speech', {
    method: 'POST', headers: auth(env),
    body: JSON.stringify({ model, voice, input: body.text.trim(), instructions, response_format: 'mp3' })
  }, async response => {
    const mimeType = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!['audio/mpeg', 'application/octet-stream'].includes(mimeType)) throw new Error('Invalid speech content type');
    const audio = await limitedBytes(response, 16 * 1024 * 1024);
    if (!audio.length) throw new Error('Empty speech audio');
    return audio;
  });
  return { audioBase64: toBase64(bytes), mimeType: 'audio/mpeg' };
}, 24 * 1024 * 1024);

function requireKey(env) {
  if (!env.OPENAI_API_KEY) throw new RequestError(503, 'Voice service is not configured.', 'CONFIGURATION');
}

function auth(env) { return { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }; }
