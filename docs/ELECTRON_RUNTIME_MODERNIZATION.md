# Task 5 — Electron runtime modernization

## Pre-upgrade compatibility assessment (2026-10-17)

Baseline: `main` at `e7e7547` after PR #4. This section was written before
changing package.json or installing a new Electron runtime.

Official stable releases are **44.9.0**, **43.8.0** and **42.11.15**; 45 beta and
46 nightly are excluded. Electron supports its latest three stable major lines.
Select and exactly pin **44.9.0**, the current stable patch on the newest supported
line: it receives the broadest fixes and has a longer support runway than 42/43.
This is a risk-based selection, not a claim that newest automatically means
compatible. Existing tests and actual platform packaging must establish compatibility.

Official target runtime: Chromium **152.0.7977.167**, embedded Node **24.22.0**.
The host Node requirement is >=22.12.0, already satisfied by the project's declared
Node 22.12+/24 and CI. Embedded Node changes independently of host Node.
Builder remains exactly **26.15.3**; no unrelated dependency update is planned.

| Surface | Risk identified before implementation | Verification/decision |
| --- | --- | --- |
| Operating systems | Electron 33 dropped macOS 10.15, 38 dropped macOS 11, and 44 drops macOS 12. Electron 44 requires **macOS 13+**. Windows ia32 is removed in 44. | Explicit compatibility limitation: older Macs cannot use this runtime. Existing targets are Windows x64, Mac Intel x64 and ARM64; no ia32 target is lost. Windows 10+ baseline remains; local host is Windows 11 and CI uses Windows Server/macOS 15, not every minimum OS. |
| Chromium/embedded Node | Thirteen Electron majors affect web APIs, V8, native ABI, HTTP/TLS and codecs. Newer native modules require C++20; no application native addon is configured. | Keep library versions/Worker contracts unchanged; run Node/Worker tests, real renderer smoke and builder's rebuild/package steps. |
| IPC/preload | Context bridge and IPC security fixes may change object copying/frame identity. | Preserve frozen named preload API, exact trusted main-frame/URL checks and argument validation. Do not expose raw ipcRenderer or relax sandbox/context isolation. |
| Navigation/CSP/assets | File-origin behavior and privileged popup/iframe fixes may affect allowlists. | Retain file URL, default session, asset request allowlist and restrictive CSP. Exercise actual scripts/images, injected HTML/script/network rejection and IPC. No custom protocol migration. |
| Storage/restoration | Electron 32 deletes obsolete WebSQL `userData/databases`; WAH uses localStorage, not WebSQL. Chromium storage format changes can affect rollback. | Preserve app identity/session/origin. Test reload restoration and a synthetic Electron 31 profile upgraded in place; never use real learner profiles. Reverse migration/downgrade is not guaranteed. |
| File dialogs/Word | File.path removed in 32; WAH parses CSV File objects directly and obtains Word paths through main-process native dialogs. Node/fs/ZIP library behavior could change. | No replacement API needed by inspection. Keep native-dialog ownership, bounds, canonical evidence and safe Word export checks; exercise actual DOCX libraries with dialog doubles. |
| Audio recording | Permission-origin hardening, MediaRecorder codec support and Chromium media behavior may differ. | Keep audio-only trusted-document permission callbacks. Test recorder with generated audio where possible; do not auto-grant real devices. Physical microphone and macOS privacy prompts require manual testing. |
| Transcription/synthesis | Main-process fetch/Node runtime, binary/audio serialization and playback promises may change. | Existing contract/failure tests plus synthetic audio IPC handoff. Keep Worker URLs and payloads unchanged. No live provider call. |
| Playback/cancellation | Audio autoplay, blob media CSP, speech engine/voices and pending playback cancellation may differ. | Retain CSP blob media and cancellation rules. Exercise generated silent audio; actual voice quality, hardware output and OS voice availability are not implied. |
| Native APIs/packaging | NavigationHistory replaces deprecated APIs; clipboard APIs change in 44; signing/notarization and ANGLE library packaging change. | WAH does not use clipboard/history/ANGLE overrides, protocol handlers, extensions, offscreen rendering or desktop capture. Keep builder/config; inspect nonpublishing NSIS and both DMGs, runtime version and bundled contents. |

Significant regression policy: do not remove tests, weaken CSP/IPC checks or change
assessment expectations to force migration. Keep the dedicated branch and document
any blocker; return to the working baseline if the runtime cannot preserve behavior.

Sources: [official releases](https://releases.electronjs.org/),
[44.9.0 release](https://releases.electronjs.org/release/v44.9.0),
[support policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines),
[breaking changes 32–44](https://www.electronjs.org/docs/latest/breaking-changes).

## Baseline audit

`npm audit --json` before changes: **12 affected packages: 10 moderate, 2 high,
0 critical**. This includes inherited package records, not independent exploits.
Electron is a shipped runtime even though npm declares it as a devDependency.
Detailed baseline applicability is in [Task 4](DEPENDENCY_SECURITY.md).

## Implementation and verification

The assessment above was committed separately (`2a02c2c`) before installation.
Exact implementation changes:

- Pin Electron **44.9.0** in package.json/lockfile. Builder remains **26.15.3**;
  all direct production dependency versions remain unchanged. Electron's required
  downloader becomes `@electron/get@5.1.0`, with its maintained internal ZIP
  extractor 1.0.5 and associated Node types/env-paths/undici/semver tree. No unrelated
  dependency update or audit fix was performed.
- Original 22-check smoke retains every assertion. One intermittently early image
  check now waits for image `complete` before still requiring positive natural
  width. This fixes an observed decoding race, not a missing-image regression.
- `test/runtime-compatibility.cjs` adds four real-runtime checks: exact embedded
  Electron and isolated sandbox/preload; generated WebAudio→MediaRecorder→FileReader
  audio through real transcription IPC/main service with mocked upstream; synthesis
  IPC contract; and actual muted blob playback plus application cancellation.
  `npm run test:electron` runs the original smoke followed by these focused checks.
- `test/validate-packaging.cjs` runs after builder on each native target. It checks
  expected installer filename, invokes the packaged executable in Node mode to
  assert **44.9.0**, and compares shipped main/preload/renderer/security/services,
  HTML, both banks, PapaParse and the ebook byte-for-byte with the workspace.
  Mac validation also checks declared minimum OS and logs microphone description
  availability. The existing manual workflow runs this validation before upload;
  tag-only publication conditions and `--publish never` commands are unchanged.

**No application source/configuration, IPC contracts, CSP, assessment algorithms,
question banks, thresholds, certificate evidence rules, app identity, Worker
endpoints or SmartChats authentication/README credentials changed.** App version
remains 0.7.0. No database, infrastructure or framework migration is involved.

## Regression and desktop results

- `npm ci`: passed from the updated lockfile on Windows (Node 24.15.0).
- `npm test` and `npm run test`: each **58 passed, 0 failed**. These aliases run
  the same suite; they are not 116 distinct tests.
- `npm run test:electron`: original **22 passed, 0 failed**, plus **4 passed,
  0 failed** targeted runtime/media checks. Actual process reported Electron
  **44.9.0**, Chromium **152.0.7977.167**, Node **24.22.0**.
- Seven stages, SmartChats external-opening IPC, actual CSV import, actual Word
  libraries/import/export, fallback, reload restoration, certificate rejection,
  literal HTML handling, inline/network CSP rejection and privileged IPC remain
  covered by the unchanged expectations. Browser launching/native dialogs/provider
  responses are doubles; a real external browser/service was not exercised.
- An optional additional run cloned a closed **synthetic Electron 31** smoke profile
  from Task 4 into a new temporary directory, leaving the source untouched. All
  **7 focused checks passed**, including three extra checks for existing localStorage
  completion, valid restored certificate export and rejection of manipulated flags.
  This demonstrates one Windows synthetic profile upgrade, not universal profile
  compatibility or safe downgrade. GPU command-buffer diagnostics appeared after
  process shutdown in that optional run; exit was 0 and no failed assertion resulted.

Physical microphone/camera, macOS privacy prompts, real voice quality and live
transcription/synthesis remain unverified. Generated recording uses an oscillator
connected only to a MediaStreamDestination (no physical input/speaker connection).
Playback uses muted silent WAV. The synthesis provider double returns a header-only
base64 response for transport validation; it is not a real decodable TTS output.
Existing Node tests cover speech fallback/cancellation promises. OS speech-engine
availability and audible system speech are not established by these tests.

### Windows setup and verification

```powershell
Set-Location 'D:\200 - WorkingatHeights\work-at-heights'
node --version # Node 24 LTS recommended, or 22.12+
npm.cmd ci
npm.cmd audit
npm.cmd test
npm.cmd run test
npm.cmd run test:electron
npm.cmd run dist:win -- --publish never
node test/validate-packaging.cjs
npm.cmd start
```

For a supplemental storage migration check, provide only a closed, synthetic
Electron 31 profile (created before upgrading). The test copies it before opening:

```powershell
$env:WAH_LEGACY_PROFILE = 'C:\path\to\synthetic-electron31-profile'
try { & .\node_modules\.bin\electron.cmd test/runtime-compatibility.cjs }
finally { Remove-Item Env:WAH_LEGACY_PROFILE }
```

The optional profile must contain the smoke's `Synthetic Learner` /
`smoke@example.invalid` completed session. Never supply a real learner profile.
Back up production profiles before manually upgrading; rollback of Chromium's
on-disk storage format is not guaranteed. No real profile is migrated by tests.

## Security delta and remaining risks

| Audit scope | Before | After |
| --- | --- | --- |
| Full npm tree | 12: 10 moderate, 2 high, 0 critical | **10 moderate, 0 high, 0 critical** |
| Omit development dependencies | 3 moderate | **3 moderate**, unchanged |

The Electron high record and obsolete `extract-zip` high record are cleared. The
supported runtime brings the current Chromium/Node security patches and Electron
fixes covering context bridge copying, isolation, permission origins, navigation,
iframes/popups and platform-specific privileged APIs. Many previously listed
advisories required unused features; do not interpret the count delta as two
independently demonstrated exploits or proof that every Chromium issue is tracked
by npm. No newly affected npm package appeared in the post-upgrade audit.

Remaining moderate records: `sprintf-js`, `argparse`, `mammoth`, `roarr`,
`global-agent`, builder's `@electron/get`, `app-builder-lib`, `dmg-builder`,
`electron-builder-squirrel-windows`, `electron-builder`. These are the existing
formatting advisory and inherited records. Runtime Mammoth's CLI path is not used
by WAH; the other route is builder's binary download/proxy logging. No
learner-controlled format string was identified. Upstream fixes, not forced
Mammoth/builder downgrades or unrelated major overrides, remain the recommendation.
`npm audit` exits nonzero while these advisories remain.

Certificates still cannot authenticate a fully consistent forged local history;
Task 3's documented provenance boundary is unchanged. Minimum-OS launches,
signed/notarized installation, macOS Gatekeeper/Windows SmartScreen, physical
microphone use, OS speech engines and live provider interactions require separate
manual validation. A stable runtime still requires ongoing patch updates.

## Nonpublishing packaging

Local Windows x64 NSIS packaging passed with Electron 44.9.0 and builder 26.15.3.
Expected file: `Working at Height Learning Track Setup 0.7.0.exe`.
Native packaged-runtime execution and required ASAR content comparisons passed.
Cross-platform workflow results will be recorded after the manual run completes.
Building artifacts is not an installed-app or signing/notarization test. No
production service, release, tag or merge is part of this task.
