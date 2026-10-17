import { RequestError, workerBoundary, normalizeChat, upstreamJson, chatContent } from './src/worker-common.mjs';

// UF only. No fallback to OpenAI or another provider. Secrets stay in Worker env.
const UF_API_URL = 'https://api.ai.it.ufl.edu/v1/chat/completions';
const MODEL = 'granite-3.3-8b-instruct';

export default workerBoundary(async (body, env) => {
  if (body.action !== undefined && body.action !== 'chat') throw new RequestError(400, 'Unsupported action.');
  const payload = normalizeChat(body, true); // Retain the older {prompt} caller contract.
  if (!env.UF_API_KEY) throw new RequestError(503, 'UF service is not configured.', 'CONFIGURATION');
  const data = await upstreamJson(UF_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.UF_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, ...payload })
  });
  const content = chatContent(data);
  return { content, result: content }; // Canonical field plus legacy response alias.
}, 512 * 1024);
