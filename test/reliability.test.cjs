const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { loadServiceConfig, createServiceClient } = require('../src/services.cjs');
const { root, renderer, mainProcess, worker } = require('./helpers.cjs');
const question = JSON.parse(fs.readFileSync(path.join(root, 'data/question-bank.json')))[0];
const messages = [{ role: 'system', content: 'Synthetic persona' }, { role: 'user', content: 'Synthetic conversation' }];
const config = { chatEndpoint: 'https://chat.example.invalid/', voiceEndpoint: 'https://voice.example.invalid/', requestTimeoutMs: 1000 };
const request = body => new Request('https://worker.example.invalid/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const success = () => Response.json({ choices: [{ message: { content: 'Synthetic response' } }] });

test('configuration preserves production defaults and keeps private overrides outside renderer', async () => {
  const defaults = JSON.parse(fs.readFileSync(path.join(root, 'data/config.json')));
  const loaded = loadServiceConfig(root, {});
  assert.equal(loaded.chatEndpoint, defaults.apiEndpoint);
  assert.equal(loaded.voiceEndpoint, defaults.voiceEndpoint);
  assert.equal(loaded.requestTimeoutMs, 45000);
  assert.deepEqual(Object.keys(loaded.rendererConfig).sort(), ['maxTokens', 'useLocalFallbackWhenApiFails']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wah-config-test-'));
  try {
    const file = path.join(dir, 'private.json');
    fs.writeFileSync(file, JSON.stringify({ chatEndpoint: 'http://127.0.0.1:8787/', voiceEndpoint: 'https://private.example.invalid/', chatAuthToken: 'test-only-token', requestTimeoutMs: 3000 }));
    const override = loadServiceConfig(root, { WAH_CONFIG_FILE: file, WAH_CHAT_ENDPOINT: 'http://localhost:8788/', WAH_REQUEST_TIMEOUT_MS: '2000' });
    assert.equal(override.chatEndpoint, 'http://localhost:8788/');
    assert.equal(override.voiceEndpoint, 'https://private.example.invalid/');
    assert.equal(override.requestTimeoutMs, 2000);
    assert.equal(override.chatAuthToken, 'test-only-token');
    assert.ok(!JSON.stringify(override.rendererConfig).includes('token'));
    assert.ok(!JSON.stringify(override.rendererConfig).includes('private'));
    fs.writeFileSync(file, '{bad');
    assert.throws(() => loadServiceConfig(root, { WAH_CONFIG_FILE: file }), /configuration/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const main = mainProcess();
  const publicConfig = await main.handlers.get('read-json')(null, 'data/config.json');
  assert.deepEqual(publicConfig, loaded.rendererConfig);
  await assert.rejects(main.handlers.get('read-json')(null, '../package.json'), /Unsupported/);
});

test('invalid endpoints/timeouts fail explicitly without leaking credentials or falling back', () => {
  for (const url of ['http://remote.example.invalid', 'file:///secret', 'https://user:private@example.invalid', 'not-a-url']) {
    assert.throws(() => loadServiceConfig(root, { WAH_CHAT_ENDPOINT: url }), error => !error.message.includes('private') && /Invalid/.test(error.message));
  }
  for (const timeout of ['0', '-1', 'NaN', '180001']) assert.throws(() => loadServiceConfig(root, { WAH_REQUEST_TIMEOUT_MS: timeout }), /requestTimeoutMs/);
});

test('chat success preserves persona/context and normalizes deployed content and legacy result', async () => {
  for (const field of ['content', 'result']) {
    const client = createServiceClient({ ...config, chatAuthToken: 'test-only-token' }, { fetchImpl: async (url, options) => {
      assert.equal(url, config.chatEndpoint);
      assert.equal(options.headers.Authorization, 'Bearer test-only-token');
      assert.equal(options.redirect, 'error');
      assert.deepEqual(JSON.parse(options.body), { messages, maxTokens: 700 });
      return Response.json({ [field]: 'Synthetic response' });
    } });
    assert.equal(await client.chat({ messages, maxTokens: 700 }), 'Synthetic response');
  }
});

for (const operation of ['chat', 'transcribe', 'speech']) {
  const invoke = client => operation === 'chat' ? client.chat({ messages }) : operation === 'transcribe' ? client.transcribe({ audioBase64: 'AQID' }) : client.speech({ text: 'Synthetic test' });
  test(`${operation}: timeout covers a stalled request and a stalled response body`, async () => {
    for (const fetchImpl of [() => new Promise(() => {}), async () => ({ ok: true, headers: new Headers(), text: () => new Promise(() => {}) })]) {
      const client = createServiceClient({ ...config, requestTimeoutMs: 10 }, { fetchImpl });
      await assert.rejects(invoke(client), /timed out/);
    }
  });
  test(`${operation}: network/status/JSON/shape failures are sanitized and do not retry providers`, async () => {
    for (const fetchImpl of [
      async () => { throw new Error('private learner audio/token'); },
      async () => new Response('private learner conversation', { status: 503 }),
      async () => new Response('{private malformed'),
      async () => Response.json({ error: 'private provider detail' }),
      async () => Response.json({ unexpected: true }),
      async () => Response.json({ content: 42, audioBase64: 'bad', text: 42 })
    ]) {
      let calls = 0;
      const client = createServiceClient(config, { fetchImpl: (...args) => { calls++; return fetchImpl(...args); } });
      await assert.rejects(invoke(client), error => !/private|learner|token/.test(error.message) && /service/.test(error.message));
      assert.equal(calls, 1);
    }
  });
}

test('transcription aliases/empty result and synthesis normalize correctly without changing voices', async () => {
  for (const field of ['text', 'transcript', 'content']) {
    const client = createServiceClient(config, { fetchImpl: async () => Response.json({ [field]: '' }) });
    assert.deepEqual(await client.transcribe({ audioBase64: 'AQID' }), { text: '' });
  }
  const client = createServiceClient(config, { fetchImpl: async (_url, options) => {
    assert.equal(JSON.parse(options.body).voice, 'sage');
    return Response.json({ audioBase64: 'AQID', mimeType: 'audio/mpeg' });
  } });
  assert.deepEqual(await client.speech({ text: 'Synthetic', voice: 'sage' }), { audioBase64: 'AQID', mimeType: 'audio/mpeg' });
});

test('invalid or oversized desktop payloads never reach the network', () => {
  const client = createServiceClient(config, { fetchImpl: () => { assert.fail('Unexpected upstream request'); } });
  for (const payload of [{}, { messages: [] }, { messages, maxTokens: 0 }, { messages: [{ role: 'tool', content: 'test' }] }]) assert.throws(() => client.chat(payload));
  assert.throws(() => client.chat({ messages: [{ role: 'user', content: 'x'.repeat(300001) }] }));
  assert.throws(() => client.transcribe({ audioBase64: 'not base64' }));
  assert.throws(() => client.transcribe({ audioBase64: 'AQID', mimeType: 'text/html' }));
  assert.throws(() => client.speech({ text: 'x'.repeat(16001) }));
});

test('desktop rejects oversized response metadata without reading private bodies', async () => {
  const client = createServiceClient(config, { fetchImpl: async () => ({
    ok: true, headers: new Headers({ 'content-length': String(33 * 1024 * 1024) }),
    text: () => { assert.fail('Oversized body should not be read'); }
  }) });
  await assert.rejects(client.chat({ messages }), /invalid response/);
});

test('interview request failure recovers controls and retains the question and answer for retry', async () => {
  const h = renderer({ callCimatec: async () => { throw new Error('Synthetic failure'); } });
  h.context.question = question;
  h.run('state.interview.activeQuestion=question; config.useLocalFallbackWhenApiFails=false');
  h.element('answerBox').value = 'Synthetic answer';
  await h.run('handleAnswer(false)');
  assert.equal(h.element('submitAnswer').disabled, false);
  assert.equal(h.element('skipAnswer').disabled, false);
  assert.equal(h.element('answerBox').value, 'Synthetic answer');
  assert.equal(h.run('state.interview.activeQuestion.id'), question.id);
  assert.equal(h.run('state.interview.history.length'), 0);
});

test('malformed AI evaluation/debrief shapes follow existing local fallback', async () => {
  const h = renderer({ callCimatec: async () => JSON.stringify({ evaluation: { score: 'bad' }, message: {} }) });
  h.context.question = question;
  h.run('config.useLocalFallbackWhenApiFails=true');
  const evaluation = await h.run("evaluateWithApi(question,'',false)");
  assert.equal(evaluation.correctness, 'Incorrect');
  const debrief = await h.run("nextDebriefingMessage('Synthetic reflection')");
  assert.equal(debrief.complete, false);
  assert.equal(typeof debrief.message, 'string');
});

test('empty transcription and transcription failure release recording controls in both modes', async () => {
  for (const mode of ['interview', 'debrief']) for (const fail of [false, true]) {
    const h = renderer({ transcribeAudio: async () => { if (fail) throw new Error('Synthetic failure'); return { text: '' }; } });
    h.context.navigator = { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } };
    h.context.Blob = Blob;
    h.context.MediaRecorder = class { start() {} stop() {} };
    h.context.FileReader = class {
      readAsDataURL() { this.result = 'data:audio/webm;base64,AQID'; this.onloadend(); }
    };
    h.run(`voiceState.mode='${mode}'`);
    await h.run('startVoiceRecording()');
    h.run("voiceState.audioChunks=[new Blob(['synthetic'])]; voiceState.speechDetected=true");
    await h.run('voiceState.mediaRecorder.onstop()');
    assert.equal(h.run('voiceState.transcribing'), false);
    if (mode === 'interview') {
      assert.equal(h.element('submitAnswer').disabled, false);
      assert.equal(h.element('skipAnswer').disabled, false);
    } else assert.equal(h.element('submitDebriefAnswer').disabled, false);
  }
});

test('speech cancellation settles awaited system playback', async () => {
  const h = renderer();
  h.context.SpeechSynthesisUtterance = class {};
  h.context.window.speechSynthesis = { cancel() {}, speak() {} };
  h.run('voiceState.supportedSpeech=true');
  const playback = h.run("speakWithSystemVoice('Synthetic text')");
  h.run('cancelInterviewerSpeech()');
  await playback;
  assert.equal(h.run('voiceState.finishPlayback'), null);
});

for (const entry of ['cloudflare-worker.js', 'src/cloudflare-transcription-worker.js']) {
  const env = { UF_API_KEY: 'test-only-key', OPENAI_API_KEY: 'test-only-key' };
  test(`${entry}: rejects malformed requests, methods, and unknown actions before upstream`, async () => {
    const w = worker(entry);
    for (const body of [null, [], {}, { messages: [] }, { messages, maxTokens: -1 }, { messages, temperature: 5 }, { action: 'unknown', messages }]) {
      assert.equal((await w.fetch(request(body), env)).status, 400);
    }
    assert.equal((await w.fetch(new Request('https://example.invalid'), env)).status, 405);
    assert.equal((await w.fetch(new Request('https://example.invalid', { method: 'OPTIONS' }), env)).status, 204);
    assert.equal((await w.fetch(new Request('https://example.invalid', { method: 'POST', body: '{}' }), env)).status, 415);
    assert.equal((await w.fetch(new Request('https://example.invalid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' }), env)).status, 400);
  });

  test(`${entry}: optional auth, required-auth configuration, origins and rate binding are enforced`, async () => {
    const w = worker(entry, async () => success());
    const secured = { ...env, CLIENT_AUTH_TOKEN: 'test-only-client-token' };
    assert.equal((await w.fetch(request({ messages }), secured)).status, 401);
    const authorized = request({ messages });
    authorized.headers.set('Authorization', 'Bearer test-only-client-token');
    assert.equal((await w.fetch(authorized, secured)).status, 200);
    assert.equal((await w.fetch(request({ messages }), { ...env, REQUIRE_AUTH: 'true' })).status, 503);
    const disallowed = request({ messages });
    disallowed.headers.set('Origin', 'https://untrusted.example.invalid');
    assert.equal((await w.fetch(disallowed, { ...env, ALLOWED_ORIGINS: 'https://trusted.example.invalid' })).status, 403);
    const denied = await w.fetch(request({ messages }), { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } });
    assert.equal(denied.status, 429);
  });

  test(`${entry}: streamed request limits apply without trusting Content-Length`, async () => {
    const limit = entry === 'cloudflare-worker.js' ? 512 * 1024 : 24 * 1024 * 1024;
    const w = worker(entry);
    const oversized = new Request('https://example.invalid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(limit + 1) });
    assert.equal((await w.fetch(oversized, env)).status, 413);
  });

  test(`${entry}: upstream failures are bounded/sanitized; no provider substitution`, async () => {
    for (const fake of [async () => { throw new Error('private provider token'); }, async () => new Response('private upstream detail', { status: 500 }), async () => Response.json({ choices: [] })]) {
      let count = 0;
      const response = await worker(entry, (...args) => { count++; return fake(...args); }).fetch(request({ messages }), env);
      assert.equal(response.status, 502);
      assert.ok(!(await response.text()).includes('private'));
      assert.equal(count, 1);
    }
    const timeout = await worker(entry, () => new Promise(() => {}), { setTimeout: fn => setTimeout(fn, 10) }).fetch(request({ messages }), env);
    assert.equal(timeout.status, 504);
  });
}

test('UF legacy prompt/result contract remains supported without replacing desktop personas', async () => {
  const w = worker('cloudflare-worker.js', async (_url, options) => {
    assert.equal(JSON.parse(options.body).messages[1].content, 'Synthetic legacy prompt');
    return success();
  });
  const response = await w.fetch(request({ prompt: 'Synthetic legacy prompt' }), { UF_API_KEY: 'test-only-key' });
  assert.deepEqual(await response.json(), { content: 'Synthetic response', result: 'Synthetic response' });
});

test('voice Worker validates audio/options and does not expose upstream errors or credentials', async () => {
  const w = worker('src/cloudflare-transcription-worker.js');
  for (const body of [{ action: 'transcribe', audioBase64: 'invalid' }, { action: 'tts', text: '' }, { action: 'tts', text: 'Synthetic', voice: {} }]) {
    assert.equal((await w.fetch(request(body), { OPENAI_API_KEY: 'test-only-key' })).status, 400);
  }
  assert.equal((await w.fetch(request({ action: 'tts', text: 'Synthetic' }), {})).status, 503);
});

test('voice Worker rejects malformed transcription/audio upstream output and preserves upstream rate limits', async () => {
  const env = { OPENAI_API_KEY: 'test-only-key' };
  for (const body of [{ action: 'transcribe', audioBase64: 'AQID' }, { action: 'tts', text: 'Synthetic' }]) {
    const malformed = worker('src/cloudflare-transcription-worker.js', async () => Response.json({ unexpected: 'private detail' }));
    const response = await malformed.fetch(request(body), env);
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes('private'));
    const limited = worker('src/cloudflare-transcription-worker.js', async () => new Response('private detail', { status: 429 }));
    assert.equal((await limited.fetch(request(body), env)).status, 429);
  }
});

test('release workflow is unique, test-gated and uses only declared npm scripts', () => {
  assert.equal(fs.existsSync(path.join(root, '.github/workflows/build.yml')), false);
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/build-release.yml'), 'utf8');
  const reusable = fs.readFileSync(path.join(root, '.github/workflows/test.yml'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  assert.match(workflow, /needs: test/);
  assert.match(workflow, /needs: build/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /if: \$\{\{ github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/v'\) && needs\.build\.result == 'success' \}\}/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/test.yml/);
  assert.match(reusable, /workflow_call:/);
  assert.doesNotMatch(workflow, /macos-13|npm install/);
  for (const [, script] of workflow.matchAll(/npm run ([\w:-]+)/g)) assert.ok(pkg.scripts[script], script);
  assert.equal((workflow.match(/--publish never/g) || []).length, 2);
});
