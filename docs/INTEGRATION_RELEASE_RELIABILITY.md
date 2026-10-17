# Task 2: Integration and release reliability

This change is based on `main` after PR #1. It preserves the seven-stage workflow, assessment banks, difficulty/scoring functions, instructor personas, local evaluation policy, certificate rules, and README SmartChats/shared-login instructions. No dependencies were added or upgraded. No Workers, secrets, installers, or releases were deployed/published.

## Request architecture and compatibility

`src/main.js` delegates the existing preload channels to `src/services.cjs`. `src/preload.js` and its public function signatures are unchanged. The renderer no longer makes its own alternative HTTP request: service selection and authentication belong to the main process.

| Operation | Before | After |
|---|---|---|
| Desktop chat | `{messages,maxTokens}` to a main.js constant; accepts content/result | Same wire request and existing production endpoint. Validated messages; bounded request/body handling; string content/result normalized to the existing string IPC result. |
| Repository UF Worker | Required `{prompt}`; returned `{result}` | Supports `{messages,maxTokens}` without replacing system/persona/context messages. Also accepts legacy `{prompt}` when messages is absent. Returns `{content,result}` with identical strings. UF remains the only upstream. |
| Repository OpenAI chat | Messages request, content response | Same contract, validated/bounded. OpenAI remains the only upstream. |
| Transcription | `{action:'transcribe',audioBase64,mimeType,fileName}` -> `{text}` | Same contract; desktop still accepts legacy transcript/content aliases. Empty string is a valid no-speech result. Invalid/missing fields are rejected. |
| Speech | `{action:'tts',text,voice,model,instructions}` -> `{audioBase64,mimeType}` | Same contract/persona voice settings. Validates text/options/base64/audio MIME and response size. |
| Error | Some raw upstream response bodies reached IPC/console | Safe operation/status messages; Worker errors use `{error,code}`. Learner conversations, audio, upstream bodies and credentials are not included in error messages. |

Task 1's deployed chat endpoint accepted the desktop format, and its voice endpoint accepted synthetic transcription/TTS. **Those are historical observations, not proof that deployed source matches this repository.** No live service probe was run in Task 2. These Worker changes exist only in the repository and tests until a separately approved deployment. Production endpoint URLs remain byte-for-byte unchanged in `data/config.json`.

The UF Worker does not call OpenAI on failure. The OpenAI Worker does not call UF. The desktop does not select another remote provider on failure. Existing local evaluation, excerpt, scripted debriefing and system-speech fallbacks remain in place. Operators can explicitly override endpoints; that is deliberate configuration, never automatic failover.

## Endpoint configuration

Production defaults now live only in `data/config.json`:

- `apiEndpoint`: existing chat Worker URL (name retained for compatibility).
- `voiceEndpoint`: existing transcription/speech Worker URL.
- `requestTimeoutMs`: 45000 milliseconds.
- `maxTokens` and `useLocalFallbackWhenApiFails`: existing learning settings.

Main-process configuration precedence: **environment override > optional external JSON file > bundled defaults**. Restart Electron after changing configuration.

| Environment variable | Optional external JSON property | Purpose |
|---|---|---|
| `WAH_CHAT_ENDPOINT` | `chatEndpoint` | Chat service URL. |
| `WAH_VOICE_ENDPOINT` | `voiceEndpoint` | Transcription/speech service URL. |
| `WAH_REQUEST_TIMEOUT_MS` | `requestTimeoutMs` | Deadline for full response, 100–180000 ms. |
| `WAH_CHAT_AUTH_TOKEN` | `chatAuthToken` | Optional chat proxy access token, not an upstream provider key. |
| `WAH_VOICE_AUTH_TOKEN` | `voiceAuthToken` | Optional voice proxy access token, not an upstream provider key. |
| `WAH_CONFIG_FILE` | — | Path to an external, private JSON configuration file. |

Only HTTPS endpoints are accepted, except loopback HTTP (`localhost`, `127.0.0.1`, `[::1]`) for local development. URL credentials and fragments are rejected. Invalid overrides fail explicitly rather than silently falling back to production.

No `.env` loader is introduced. Example, for already-running local mock services:

```powershell
Set-Location -LiteralPath 'D:\200 - WorkingatHeights\work-at-heights'
$env:WAH_CHAT_ENDPOINT = 'http://127.0.0.1:8787/'
$env:WAH_VOICE_ENDPOINT = 'http://127.0.0.1:8788/'
$env:WAH_REQUEST_TIMEOUT_MS = '15000'
npm.cmd start
```

These commands do not provision local Workers. To return to production defaults in this PowerShell session:

```powershell
Remove-Item Env:WAH_CHAT_ENDPOINT -ErrorAction SilentlyContinue
Remove-Item Env:WAH_VOICE_ENDPOINT -ErrorAction SilentlyContinue
Remove-Item Env:WAH_REQUEST_TIMEOUT_MS -ErrorAction SilentlyContinue
```

An external JSON file may instead contain the corresponding properties. Keep it **outside the checkout/application package**, restrict OS access, and set `WAH_CONFIG_FILE` to its path. Never put upstream UF/OpenAI API keys into desktop configuration. Proxy access tokens, when required by a separately configured service, should be supplied through a protected environment or external file and never committed.

The renderer receives only `maxTokens` and `useLocalFallbackWhenApiFails`. It cannot read private service settings through `readJson`; that bridge now allowlists the two banks and the sanitized configuration response. Main-process proxy tokens are sent only to the selected service, and redirects are rejected to avoid forwarding tokens elsewhere. This is service-to-service access control support, not a new learner authentication system.

## Reliability behavior

- A default 45-second deadline covers connection, headers and response body for all three operations. Fetch is aborted at timeout; there are no automatic retries that could duplicate paid work.
- Non-2xx responses, invalid JSON, error objects, absent fields, invalid audio and oversized responses fail with sanitized messages. Chat responses accept both deployed `content` and older `result` fields.
- Interview API/model-shape failures follow the existing configured local fallback. With fallback disabled, the current answer/question remains available and submit/skip controls recover for retry. Successful scoring/progression is unchanged.
- VR summarization still uses its existing local excerpt fallback. Debriefing still uses its existing scripted fallback, including its existing completion rules.
- Invalid model evaluation/debrief output is rejected before it can break downstream rendering/report generation. Numeric scores are still normalized/clamped by the existing function; scoring thresholds are unchanged.
- Empty or failed transcription no longer strands disabled controls. Native/system speech completion/cancellation settles pending playback promises; a three-minute watchdog bounds stalled playback. The existing system-speech fallback remains.
- No service response body or microphone payload is logged. Electron may print safe IPC error messages during deliberately failed test requests.

## Worker security and separate deployment requirements

Both Worker entry points import `src/worker-common.mjs`. They are **module Workers**; a future deployment must include/bundle this shared module. Pasting only an entry file into a standalone editor is no longer sufficient. No deployment command, configuration, or secrets change is executed by this PR.

Implemented repository safeguards:

- Validated JSON content type/body/object, action, message roles/content, token limits, speech options, audio MIME/base64/filename.
- Streamed request-size checks rather than trusting Content-Length: 512 KiB UF body, 24 MiB voice body. Chat content is capped at 300000 characters, 100 messages, and 4096 requested tokens. Audio input/output is capped at 16 MiB; speech input is capped at 16000 characters. Desktop JSON responses are capped at 32 MiB; Worker upstream JSON at 2 MiB.
- Upstream requests have a 40-second deadline covering response consumption, reject redirects, normalize upstream failures, and do not echo upstream error bodies or secrets. Upstream 429 remains 429.
- POST only, explicit OPTIONS, no-store JSON responses, controlled error codes, unknown actions rejected.
- Optional proxy bearer token, optional origin allowlist, and optional Cloudflare rate-limit binding. None is activated on production by this task.

| Worker setting/binding | Behavior and required follow-up |
|---|---|
| `UF_API_KEY` / `OPENAI_API_KEY` | Existing upstream credentials remain Worker-only. Missing keys yield a sanitized configuration error. No key values were accessed or changed. |
| `CLIENT_AUTH_TOKEN` | If configured, POST requires matching `Authorization: Bearer ...`. Coordinate desktop proxy token distribution before enabling. Existing clients without tokens would otherwise stop working. |
| `REQUIRE_AUTH=true` | Optional fail-closed guard: returns 503 if no client token is configured. Do not enable on a working endpoint without a migration plan. |
| `ALLOWED_ORIGINS` | Optional comma-separated browser origins. Default stays `*` for existing compatibility. Requests without Origin, including main-process requests, are accepted; CORS is not authentication. Account for file-origin `null` if retaining browser callers. |
| `RATE_LIMITER` | Optional Cloudflare Rate Limiting binding; returns 429 when denied. Code uses Cloudflare connecting IP (or anonymous fallback) as a coarse abuse key because verified per-learner identity does not exist. Shared networks can share limits. Configure capacity and test legitimate training bursts before rollout. |
| `ALLOWED_TTS_MODELS` | Optional comma-separated allowlist for client-requested speech models. Absent means existing client override behavior is retained. Coordinate with the existing voice model before enabling. |

Remaining deployment work: identify/export the actual deployed Worker source; test the new modules in a separate staging environment; provision secrets/bindings through an approved process; select rate limits and upstream spending limits; plan backward-compatible token rollout; and separately approve production deployment. Without the optional controls, public endpoint abuse remains possible despite validation and body limits. A shared token in a desktop deployment is not verified learner identity and should not be treated as such.

Cloudflare's binding limits are local to a Cloudflare location and are not a global billing quota. The API and limitations are documented in [Cloudflare Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/). Global spending controls and perimeter protections remain infrastructure follow-up.

## Release workflow

Manual packaging is available through `workflow_dispatch`. It runs the same test gate and all three installer targets, uploading Actions artifacts without publishing. The publish job explicitly requires a successful `push` event on `refs/tags/v*`; even a manual run selecting a tag cannot publish or create a tag. Builder commands retain `--publish never`.

To run in GitHub: open **Actions > Build and Release Installers > Run workflow**, select **codex/integration-release-reliability** in the Branch selector, then **Run workflow**. Open that run, check Windows/mac-intel/mac-arm jobs independently, confirm **publish** is skipped, and download the three `installers-*` artifacts from its summary. GitHub may withhold the Run workflow button until the dispatch-enabled workflow exists on the default branch; do not merge or create tags just to work around that restriction. An authenticated REST dispatch against the feature branch can be attempted separately.

- Removed duplicate `.github/workflows/build.yml`.
- Kept `.github/workflows/build-release.yml` as the sole v-tag release workflow.
- Added `workflow_call` to the existing test workflow. Release packaging has `needs: test`, using the same Windows Node 20/24 `npm ci` + `npm test` matrix as PR checks.
- Packaging uses Node 24 and `npm ci`. Windows invokes the existing `dist:win` script; macOS invokes the installed builder with `npx --no-install`.
- Windows x64 NSIS and macOS x64/arm64 DMG targets are retained. Runners are `windows-latest`, `macos-15-intel`, and `macos-15`; these architecture-specific macOS labels appear in the [GitHub runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). Removed obsolete `macos-13`.
- All builder commands use `--publish never` and receive no GitHub publishing token. Build jobs have read-only repository permission.
- Each target uploads artifacts; a single job with `needs: build` and contents-write permission publishes .exe/.dmg only after all builds succeed. macOS signing auto-discovery is disabled because signing/notarization is not configured here. No signing guarantees are added.
- The workflow still publishes only on a future v-tag push. No tags were pushed and no releases/installers were published in this task. Installer packaging, macOS execution, signing and publication remain unverified until separately executed. Update metadata is retained as CI artifacts rather than merging conflicting architecture metadata into a release; the app has no implemented auto-update client.

## Verification record

Local environment: Windows, Node **24.15.0**, npm **11.12.1**, locked Electron **31.7.7**. No dependency/lockfile upgrades.

| Command/check | Result |
|---|---|
| `npm.cmd ci` | Passed after closing this repository's running Electron processes; the first attempt hit an Electron file lock. |
| `npm.cmd test` | **47 passed, 0 failed**: original baseline plus configuration/privacy, transport success/timeout/body stalls/network/non-2xx/malformed responses, provider preservation, Worker auth/limits/errors, and control recovery. |
| `npm.cmd run test:electron` | **15 passed, 0 failed**: real main/preload/renderer, configuration sanitization, failed-request recovery, seven-stage flow, exports and reload persistence. Synthetic profile; remote service failures, file dialogs and shell launch mocked. |
| `git diff --check` | Passed. |
| Live probes | **Not run in Task 2.** `node test/probe-integrations.cjs --live` remains opt-in, now uses centralized configuration. |
| Release packaging/publication | Not run. No release or Worker deployment. |

The original 19 baseline tests remain, except the obsolete UF-mismatch assertion now verifies the fixed contract and persona preservation. Question/scoring/session/certificate assertions remain unchanged. Node tests execute actual Worker functions in VM contexts with their shared module bundled in memory; they are not a Cloudflare runtime/staging deployment.

Expected deliberately failed chat IPC messages appear during the Electron smoke, but contain no private conversation/audio content. Microphone capture, audible speech playback, genuine SmartChats login/results, headset use, Word visual layout, live model evaluation quality, and packaged installers remain unverified.

`npm ci` continues to report 23 dependency advisories (6 moderate, 16 high, 1 critical); remediation remains outside this task's no-upgrade scope.

## Manual packaging validation follow-up

Executed the dispatch-enabled workflow on commit `b58617b` before merging: [run 39062311947](https://github.com/agsiqueira/work-at-heights/actions/runs/39062311947). This supersedes the initial packaging-unverified status above for **build generation only**, not installer execution or signing.

- `actionlint` 1.7.12 passed for the release/reusable test workflows, including GitHub Actions expressions. The standalone validator was checksum-verified and kept in a temporary directory; no project dependency was changed.
- Local regression suite: **47 passed, 0 failed**. Isolated Electron smoke: **15 passed, 0 failed**.
- The manual run's reusable Node 20/24 test jobs and all three packaging jobs passed. **publish was skipped**. No tag or GitHub Release was created.
- Downloaded the three Actions ZIPs into a temporary inspection directory, verified their SHA-256 against GitHub artifact digests, and inspected ZIP directories without extracting/executing installers.

| Platform | Installer confirmed in ZIP | Actions artifact | Result |
|---|---|---|---|
| Windows x64 NSIS | `Working at Height Learning Track Setup 0.7.0.exe` | [installers-windows](https://github.com/agsiqueira/work-at-heights/actions/runs/39062311947/artifacts/12112011943) | Build/upload/checksum passed |
| macOS Intel x64 DMG | `Working at Height Learning Track-0.7.0.dmg` | [installers-mac-intel](https://github.com/agsiqueira/work-at-heights/actions/runs/39062311947/artifacts/12111942366) | Build/upload/checksum passed |
| macOS ARM64 DMG | `Working at Height Learning Track-0.7.0-arm64.dmg` | [installers-mac-arm](https://github.com/agsiqueira/work-at-heights/actions/runs/39062311947/artifacts/12111358365) | Build/upload/checksum passed |

Packaging warnings/limits: default Electron icon is used; macOS code signing was explicitly skipped and notarization was not configured/tested. Dependency/action-runtime deprecation warnings remain. No installer was installed/launched, and installer binary signatures were not independently checked. No application behavior, dependency, Worker deployment or PR merge occurred in this follow-up.

## Developer checklist

```powershell
Set-Location -LiteralPath 'D:\200 - WorkingatHeights\work-at-heights'
npm.cmd ci
npm.cmd test
npm.cmd run test:electron
npm.cmd start
```

- Close this checkout's Electron window before reinstalling dependencies if files are locked.
- Use synthetic learner data. Keep the existing SmartChats login/CSV instructions.
- Use environment or an external private file for development endpoint overrides; restart Electron.
- Review CI results before merging. Do not use v-tags merely to test the release workflow.
- Separately approve and stage any Worker security rollout; do not apply production secrets/bindings implicitly.
