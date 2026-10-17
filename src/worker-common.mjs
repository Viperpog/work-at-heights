// Shared Worker boundary code. Deploy with the entry module; secrets stay in env.
export class RequestError extends Error {
  constructor(status, message, code = 'INVALID_REQUEST') { super(message); this.status = status; this.code = code; }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export async function limitedBytes(message, limit) {
  if (Number(message.headers.get('content-length')) > limit) throw new RequestError(413, 'Request or response is too large.', 'SIZE_LIMIT');
  if (!message.body) return new Uint8Array();
  const reader = message.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RequestError(413, 'Request or response is too large.', 'SIZE_LIMIT'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export function normalizeChat(body, legacyPrompt = false) {
  let messages = body.messages;
  if (messages === undefined && legacyPrompt && typeof body.prompt === 'string' && body.prompt.trim()) {
    messages = [{ role: 'system', content: 'You are a precise evaluator. Return valid JSON only.' }, { role: 'user', content: body.prompt }];
  }
  if (!Array.isArray(messages) || !messages.length || messages.length > 100) throw new RequestError(400, 'A nonempty messages array is required.');
  let size = 0;
  messages = messages.map(message => {
    if (!message || !['system', 'developer', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim()) throw new RequestError(400, 'Invalid chat message.');
    size += message.content.length;
    return { role: message.role, content: message.content };
  });
  if (size > 300000) throw new RequestError(413, 'Chat content is too large.', 'SIZE_LIMIT');
  const maxTokens = body.maxTokens ?? 1200;
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4096) throw new RequestError(400, 'Invalid maxTokens.');
  const temperature = body.temperature ?? 0.2;
  if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new RequestError(400, 'Invalid temperature.');
  return { messages, max_tokens: maxTokens, temperature };
}

export function base64Bytes(value) {
  if (typeof value !== 'string' || !value.length || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new RequestError(400, 'Invalid audioBase64.');
  if (value.length > Math.ceil(16 * 1024 * 1024 / 3) * 4) throw new RequestError(413, 'Audio is too large.', 'SIZE_LIMIT');
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function upstream(url, options, consume) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new RequestError(504, 'Upstream request timed out.', 'UPSTREAM_TIMEOUT'));
    }, 40000);
  });
  try {
    return await Promise.race([(async () => {
      const response = await fetch(url, { ...options, signal: controller.signal, redirect: 'error' });
      if (!response.ok) {
        await response.body?.cancel();
        throw new RequestError(response.status === 429 ? 429 : 502, 'Upstream service failed.', 'UPSTREAM_FAILURE');
      }
      return await consume(response);
    })(), timeout]);
  } catch (error) {
    if (error instanceof RequestError && error.status !== 413) throw error;
    throw new RequestError(502, 'Invalid or unavailable upstream response.', 'UPSTREAM_FAILURE');
  } finally { clearTimeout(timer); controller.abort(); }
}

export async function upstreamJson(url, options) {
  return upstream(url, options, async response => {
    const data = JSON.parse(new TextDecoder().decode(await limitedBytes(response, 2 * 1024 * 1024)));
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.error) throw new Error('Invalid upstream response');
    return data;
  });
}

export function chatContent(data) {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new RequestError(502, 'Invalid upstream chat response.', 'UPSTREAM_FAILURE');
  return content;
}

export function workerBoundary(handler, maxBytes) {
  return {
    async fetch(request, env) {
      const origin = request.headers.get('Origin');
      const allowed = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map(value => value.trim()) : null;
      const headers = {
        'Access-Control-Allow-Origin': allowed ? (allowed.includes(origin) ? origin : '') : '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Vary': 'Origin'
      };
      try {
        if (origin && allowed && !allowed.includes(origin)) throw new RequestError(403, 'Origin is not allowed.', 'FORBIDDEN');
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
        if (request.method !== 'POST') return json({ error: 'POST required.', code: 'METHOD_NOT_ALLOWED' }, 405, { ...headers, Allow: 'POST, OPTIONS' });
        if (env.REQUIRE_AUTH === 'true' && !env.CLIENT_AUTH_TOKEN) throw new RequestError(503, 'Service access is not configured.', 'CONFIGURATION');
        if (env.CLIENT_AUTH_TOKEN) {
          const supplied = request.headers.get('Authorization') || '';
          const expected = `Bearer ${env.CLIENT_AUTH_TOKEN}`;
          let difference = supplied.length ^ expected.length;
          for (let i = 0; i < expected.length; i++) difference |= (supplied.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
          if (difference !== 0) throw new RequestError(401, 'Unauthorized.', 'UNAUTHORIZED');
        }
        // Optional Cloudflare binding. No per-isolate counter pretending to be global protection.
        if (env.RATE_LIMITER) {
          const { success } = await env.RATE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'anonymous' });
          if (!success) throw new RequestError(429, 'Too many requests. Please retry later.', 'RATE_LIMIT');
        }
        if ((request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new RequestError(415, 'application/json required.');
        let body;
        try { body = JSON.parse(new TextDecoder().decode(await limitedBytes(request, maxBytes))); }
        catch (error) { if (error instanceof RequestError) throw error; throw new RequestError(400, 'Invalid JSON.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError(400, 'A JSON object is required.');
        return json(await handler(body, env), 200, headers);
      } catch (error) {
        const known = error instanceof RequestError;
        return json({ error: known ? error.message : 'Service request failed.', code: known ? error.code : 'SERVICE_FAILURE' }, known ? error.status : 502, headers);
      }
    }
  };
}
