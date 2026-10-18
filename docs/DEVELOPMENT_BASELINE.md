# Startup and integration verification baseline

This is the historical Task 1 verification record. Current Node requirements, dependency versions and setup/validation commands are in [Task 4 dependency security](DEPENDENCY_SECURITY.md). Integration/configuration changes are documented in [Task 2 reliability](INTEGRATION_RELEASE_RELIABILITY.md).

Verified locally on Windows on 2026-10-17. Only tests, test configuration, and this document were changed. Production source, assessment content, README instructions, shared login, credentials, and external services were not modified. Nothing was deployed.

## Environment and startup

- Local runtime: Node.js **24.15.0**, npm **11.12.1**.
- Existing release workflows specify Node **20**, but package.json has no engines range or runtime version file. Node 20 is a repository baseline, not a declaration of current upstream support. Node 24 worked for the checks below. Node 20 execution remains for CI verification.
- Lockfile: Electron **31.7.7**, electron-builder **24.13.3**, docx **8.5.0**, Mammoth **1.12.0**, Papa Parse **5.5.3**.
- The first sandboxed `npm ci` failed with `Exit handler never called!`. Retrying outside the restricted sandbox succeeded: 360 packages added, 361 audited. This was an environment-dependent install failure, not a proven application defect.
- npm reported **23 vulnerabilities: 6 moderate, 16 high, 1 critical**. No audit fixes or version upgrades were applied. This is npm's installation summary, not a package-by-package vulnerability assessment.
- Sandboxed `npm start` exited 1 without diagnostics. Retrying outside the sandbox kept Electron running and exposed a native window titled `Working at Height Training Experience`.
- A separate, isolated Electron smoke run exercised the actual main process, preload bridge, renderer, DOM, and file IPC. Both 240-question banks and initial images loaded. The smoke run captured no unexpected renderer/preload/process errors or failed resource requests. Expected IPC errors from deliberately failing AI requests appear in its console output.
- No local HTTP server, localhost URL, database, migration, or seed step is required. `src/main.js` loads `src/index.html` with `loadFile()`.

## Windows setup and commands

Use the project's tested runtime deliberately; the local successful run used Node 24.15.0. Existing CI uses Node 20. Installing a different Node runtime is a separate developer setup step, not performed by these commands.

```powershell
Set-Location -LiteralPath 'D:\200 - WorkingatHeights\work-at-heights'
node.exe --version
npm.cmd --version
npm.cmd ci
npm.cmd test
npm.cmd run test:electron
npm.cmd start
```

`npm.cmd` avoids PowerShell execution-policy problems with npm.ps1. Keep development dependencies: Electron is one of them. `test:electron` requires an environment that can run Electron; it is deliberately separate from `npm test`.

Optional packaging command (not executed for this task):

```powershell
npm.cmd run dist:win
```

There is no lint command. No dependencies were added for testing. The lockfile is unchanged.

## Tests and results

| Check | Local result | What actually ran |
|---|---|---|
| Node baseline suite | 19 passed, 0 failed | Real renderer functions in a VM; DOM/storage doubles; real document libraries; IPC and Worker contract tests. |
| Electron smoke | 13 passed, 0 failed | Real Electron, DOM, preload, IPC, localStorage reload, CSV and Word file handling; AI/network and native dialogs doubled. |
| Live service probes | 3 compatible, 0 failed | Synthetic chat, synthetic text-to-speech, one second of generated silent WAV transcription. |
| CI matrix | Not yet verified | New Windows workflow runs npm ci/test on Node 20 and 24. GitHub execution must establish CI results. |

Files:

- `test/helpers.cjs`: fresh VM contexts, storage/DOM doubles, actual main/preload handler loading, Worker execution with fake upstream.
- `test/baseline.test.cjs`: bank integrity; identification; SmartChats CSV/classification; adaptive progression; quiz scores; readiness thresholds; persistence/reset policies; malformed input; AI success/failure/skip behavior; exports/imports; Worker contracts.
- `test/electron-smoke.cjs`: actual desktop renderer/IPC smoke test. It uses a newly created temporary profile, never the normal learner profile. It exercises the production source without modifying it.
- `test/probe-integrations.cjs`: explicit opt-in live integration probe. It logs response fields/status only, never returned text, audio, or credentials.

The VM suite removes only the renderer's final automatic `init()` call in its in-memory copy; it does not copy/reimplement scoring algorithms. Its DOM doubles do not establish browser correctness. The separate Electron test supplies that additional evidence for one fallback/skip interview path and an all-correct quiz path. Other algorithm paths run in the Node suite.

The document test creates and extracts real .docx reports and tests invalid Word input and canceled saves. Certificate export is now PDF-only: the real Electron suite exercises Chromium printing, a development-only PDF parser, native-save success/cancel, malicious text, isolation and page count. See [PDF architecture, review artifacts and independent inspection](debriefing-pdf/README.md). Temporary unit artifacts are removed from their freshly created test-owned directory. Electron smoke artifacts and profile remain in the printed `wah-electron-test-*` temporary directory for review; they contain only synthetic data.

## Seven-stage verification

| Stage | Runtime verification | Remaining limitation |
|---|---|---|
| 1 Orientation | Synthetic name/email, input event, navigation, main-process external-launch IPC. | Actual SmartChats browser login was not performed; shell launch is intercepted in smoke. |
| 2 SmartChats | Real File/DataTransfer CSV import through Papa Parse and existing listener; Basic classification. Node tests cover aliases, other levels, and missing data. | Genuine SmartChats exports and authenticated retrieval not tested. |
| 3 Interview | Actual rendered bank questions, failed AI IPC fallback, skipped answers, completion and Word export. | Full live AI assessment conversation/quality not tested. |
| 4 Quiz | Actual radio rendering, submission, progression to completion, 100% classification, Module 5 Expert encounter and export. | All possible randomized paths are not exhaustively covered. |
| 5 VR | Generated synthetic Word report, real native IPC handler/Mammoth extraction, fallback summary and level extraction. | Real VR application and report provenance not tested. |
| 6 Debrief | Four synthetic answers through fallback IPC path, completion and Word export. | Live conversational quality not tested. |
| 7 Certificate | Preview/navigation, export handler, readable generated Word text and synthetic learner identity. | Visual layout, signatures, and regulatory validity not assessed. |

Session persistence is verified in a real renderer reload within the isolated profile. Restoration rebuilding and reset policies are also tested in the VM. Native file picker interactions are not tested: dialogs return test-owned paths. Voice capture, audio playback, permission prompts, and headset interaction were not tested.

## Integration compatibility matrix

| Integration | Desktop request / expected response | Repository compatibility | Live evidence |
|---|---|---|---|
| Configured CIMATEC chat Worker | POST `{messages,maxTokens}`; expects `{content}` or `{result}` | Compatible with the messages branch in `src/cloudflare-transcription-worker.js`; incompatible with root UF Worker request. | Synthetic POST returned 200 with nonempty `content`. OPTIONS returned 405. Deployed provider/model not identified. |
| Root UF Worker | Worker expects `{prompt}` and returns `{result}` | **Incompatible** with current desktop request. Contract test reproduces 400 `Missing prompt` without calling upstream. | UF upstream not called directly; UF credentials/model availability unverified. |
| Voice Worker transcription | POST `{action:'transcribe',audioBase64,mimeType,fileName}`; expects `{text}` or aliases | Compatible with supplied Worker; fake-upstream contract test passes. Worker normalizes extension from MIME and defaults to English. | Generated silent WAV returned 200 with string `text`. This verifies transport/shape, not speech recognition accuracy. |
| Voice Worker synthesis | POST `{action:'tts',text,voice,model,instructions}`; expects `{audioBase64,mimeType}` | Compatible with supplied Worker; fake-upstream test passes. | Synthetic text returned 200 with nonempty audio and MIME type. Playback/decoding not tested. |
| Voice Worker chat | `{messages,maxTokens}` defaults to chat action | Compatible in contract test. | Desktop's chat constant targets a different endpoint; chat action on the voice endpoint not separately live-probed. |
| SmartChats | External course URL includes synthetic email; CSV records matched by email | Launch/CSV paths are implemented and smoke-tested with intercepted shell launch. | No authenticated SmartChats session or remote results retrieval was tested. |
| VR report | Selected .docx -> Mammoth raw text -> chat summary -> regex readiness | Synthetic import/fallback/export path passed. | No VR runtime or authenticated report integration exists in this repository. |

The live CIMATEC service accepting messages does not prove it was deployed from either supplied Worker, or that it uses UF. Do not infer deployed source/provider from a URL.

Live probes are separate from normal tests because they consume external service resources:

```powershell
node.exe test/probe-integrations.cjs --live
```

All requests are synthetic. The tool emits metadata only. It requires outbound HTTPS and may consume provider resources. Neither probe script nor tests provision or deploy services.

## Configuration

- Desktop endpoints are constants in `src/main.js`: `CIMATEC_PROXY_URL`, `TRANSCRIPTION_PROXY_URL`.
- `data/config.json` supplies token/fallback settings. Its `apiEndpoint` is only used by the renderer's alternative route when the normal bridge is absent. Editing it alone does not redirect normal Electron chat requests. `apiMode` has no identified consumer.
- No desktop `.env` loader or local secret configuration is implemented.
- Root Worker requires the server-side `UF_API_KEY` secret.
- Voice Worker requires server-side `OPENAI_API_KEY`; optional settings are `OPENAI_CHAT_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`, `OPENAI_TTS_INSTRUCTIONS`.
- No Worker provisioning manifest or deployment pipeline was found. Deployed secret values were neither accessed nor required for this task.

## Confirmed findings and reproduction

Application behavior was preserved, including questionable rules:

1. **Root UF Worker contract mismatch.** Run `npm test`; the named UF contract test sends the actual main-process payload to the supplied Worker and verifies 400 `Missing prompt`. Live chat nevertheless accepts the desktop format; deploy/source drift is unresolved.
2. **Completed certificate flag resets on restoration.** Complete a synthetic track, save, then restore the saved session. `applySessionToState()` calls `resetIncompleteWorkFromTab(7)`, clearing `certificateDownloaded`. The smoke and regression tests reproduce this without changing it.
3. **Zero matching SmartChats questions produces Expert.** Import a CSV without records for the entered email, or call `classifySmartChats([])`. This rule is explicitly preserved in tests.
4. **Empty VR report can mark VR complete.** Have the import boundary return empty extracted text and fail summary generation. `analyzeVrReport()` sets `vrCompleted=true`, with `Not identified`. Reproduced in the Node test.
5. **Unfinished interview is reset when restored.** Restore a session with SmartChats complete and partial interview history. History and later stages are reset. Regression test preserves the policy; documentation should describe stage-level resume.
6. **Windows release script mismatch.** By inspection, `.github/workflows/build.yml` calls `npm run dist`, absent from package.json. Its workflow and `build-release.yml` both trigger on v-tags. Release workflows were not executed or changed.
7. **Normal endpoint configuration is duplicated.** By inspection, changing only config.apiEndpoint cannot redirect the main-process constant. No endpoint changes were made.
8. **Local fallback is heuristic and lacks provenance in exported evaluation.** It credits expected-answer keyword matches, and API failure can silently switch evaluation method. Existing behavior and thresholds remain unchanged.

Security observations by inspection, not exploitation: Worker source lacks caller authentication/rate limits; VR summaries/filenames enter innerHTML; IPC paths/URLs are not constrained; learner identity and completion state are locally controlled. README shared-login instructions remain untouched as explicitly requested. No credentials are repeated in this report.

## Future direct SmartChats feasibility (not implemented)

Current integration is an external URL plus CSV, with a shared login documented in README. The email query parameter is a learner correlation value, not proof of authenticated identity.

Direct authentication and automatic results retrieval are conditionally feasible if SmartChats provides a supported identity and analytics API. No such API contract, OAuth client configuration, callback route, results schema, or developer documentation is supplied here. Public/shared-login availability alone does not establish API feasibility.

A follow-up investigation should obtain provider documentation and authorization for a sandbox tenant; determine supported authentication, desktop redirect/PKCE capabilities, learner identifiers, course/result schemas, pagination, export completeness, and data access permissions. Automatic retrieval would need a mapping to the current CSV semantics and explicit failure handling. Avoid embedding service credentials in a distributable desktop app. Do not replace the shared-login/CSV approach until separately scoped and approved. No authentication, credential, or results-retrieval feature was changed in this task.

## Recommended next task

First reconcile deployed Worker source with repository contracts and consolidate endpoint configuration and release scripts, using these tests as regression gates. Separately scope fixes to certificate restoration and missing-evidence classification; those alter existing behavior and are intentionally excluded here. Then triage dependency advisories and plan runtime/Electron updates with packaging and voice regression checks.

## Practical checklist

- [ ] Confirm intended Node version; local tests used 24.15.0, CI baseline is 20.
- [ ] Run npm.cmd ci from the repository directory.
- [ ] Run npm.cmd test (19 checks).
- [ ] Run npm.cmd run test:electron on a desktop-capable environment (13 checks).
- [ ] Optionally run the explicit live probe; do not treat shape checks as AI quality validation.
- [ ] Run npm.cmd start and use synthetic learner data.
- [ ] Retain existing SmartChats shared-login and CSV instructions.
- [ ] Manually test native file dialogs, microphone permissions/capture, playback, genuine exports, and document layout when separately ready.
- [ ] Review GitHub CI results and draft PR; do not merge or deploy as part of this baseline task.
