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

Results will be added after the assessment above is committed and the migration
is executed. No production service, release, tag or merge is part of this task.
