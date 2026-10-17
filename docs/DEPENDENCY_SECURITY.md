# Dependency security and modernization — Task 4

Historical Task 4 record. Current Electron selection, runtime compatibility,
audit delta and packaging verification are in [Task 5](ELECTRON_RUNTIME_MODERNIZATION.md).

Baseline: `main` at `081edd6` (PR #3 merged). Audit date: 2026-10-17.
Scope: dependencies, lockfile, development/CI configuration and documentation only.
Application code, seven stages, questions, scoring, SmartChats authentication,
Cloudflare contracts and certificate evidence rules are unchanged.

## Audit method and counts

Ran `npm audit --json`, `npm audit --omit=dev --json`, `npm outdated --json`,
`npm ls --all`, inspected relevant installed sources and registry metadata, and
reviewed a non-mutating `npm audit fix --dry-run --json`. Used `npm update` for
compatible upgrades first, then explicitly selected the packaging upgrade. No
`npm audit fix --force`, arbitrary transitive major overrides or advisory-driven
downgrades were used.

| Dependency state | Moderate | High | Critical | Total affected packages |
| --- | ---: | ---: | ---: | ---: |
| Before, full tree | 6 | 16 | 1 | 23 |
| Compatible updates only | 6 | 9 | 1 | 16 |
| Final, including builder update | 10 | 2 | 0 | 12 |
| Before, omit development dependencies | 3 | 3 | 0 | 6 |
| Final, omit development dependencies | 3 | 0 | 0 | 3 |

Counts are npm affected-package records, including inherited findings and multiple
advisories per package, not independently exploitable defects. Several parents
inherit one underlying advisory. Electron is declared in `devDependencies` but its
runtime binary is shipped: the production-only audit is **not** a complete audit
of the installed desktop application. npm also does not comprehensively enumerate
every vulnerability in Electron's embedded Chromium/Node components.

## Applied changes

| Package/path | Before → after | Reason and compatibility |
| --- | --- | --- |
| `mammoth` | 1.12.0 → 1.13.0 | Compatible DOCX reader update; current API remains `extractRawText`. Dependency minimum now `^1.13.0`. |
| `papaparse` | 5.5.3 → 5.7.0 | Compatible CSV update; minimum now `^5.7.0`; real CSV classification smoke passes. |
| `mammoth → @xmldom/xmldom` | 0.8.13 → 0.8.15 | Patched 0.8 line clears XML injection, malformed-input CPU/memory and parser findings. A legitimately imported document reaches this parser, making it a priority. |
| `docx → nanoid` | 5.1.11 → 5.1.16 | Clears negative-size nonsecure-generator finding without upgrading `docx`. Installed docx also bundles a generator with a default positive size; no learner-controlled size path was found. |
| `electron-store → conf → ajv → fast-uri` | 3.1.2 → 3.1.8 | Clears URI normalization/authority findings. No application import of electron-store was found; retained the direct dependency to avoid unrelated removal. |
| `electron → @electron/get → got → cacheable-request → http-cache-semantics` | 4.2.0 → 4.3.0 | Clears cache-response disclosure finding in the binary download tooling; not WAH's service HTTP client. |
| Builder `brace-expansion` copies | 1.1.15 / 2.1.1 → patched 1.1.21 / 2.1.7; new builder also uses 5.0.12 | Clears expansion denial-of-service advisories; pattern inputs are build configuration, not learner questions. |
| Builder `form-data` | 4.0.5 → 4.0.6 | Clears multipart field/filename CRLF finding in publishing tooling. WAH service requests use native fetch/JSON. |
| Builder `js-yaml` | 4.2.0 → 4.3.2 | Clears merge/omap CPU findings in configuration parsing. |
| `electron-builder`, `app-builder-lib`, `builder-util`, `dmg-builder`, `electron-publish`, optional Squirrel tooling | 24.13.x → 26.15.3 (`builder-util-runtime` 9.2.4 → 9.7.0) | Explicit major packaging upgrade removes critical tar chain and high redirect-token disclosure/AppImage findings. Builder is pinned exactly. Existing CLI/config keys remain usable; no application migration. |
| Builder `tar` | 6.2.1 → 7.5.22 | Clears critical unbounded parsing and high traversal/link/overwrite findings, including node-gyp's copy. |

Other compatible lockfile refreshes include jszip 3.10.1→3.10.2, dingbat-to-unicode
1.0.1→1.0.2, sax 1.6.0→1.6.1, semver patches and type/CLI dependencies. Builder
brings its own changed dependency graph (ASAR/universal/sign/notarize/proxy/glob/AJV
tooling); these are publisher-managed versions, not manually forced overrides.
The old plist 3.1.1/0.9.x XML parser route is replaced by plist 3.1.0 using patched
0.8.15. See the lockfile diff for every resolved version and integrity hash.

Builder v26 changes DMG filesystem behavior and signing configuration. This project
does not configure the removed signing/desktop keys or custom electronDist hooks.
Intel and ARM DMGs must nevertheless build before considering the major tool
update validated. Builds explicitly use `--publish never`; manual workflow runs
cannot reach the version-tag-only publication job.

## Every remaining affected package and risk

| Package | Severity | Path and applicability |
| --- | --- | --- |
| `electron` | High | Direct runtime 31.7.7; includes context isolation, permission-origin, navigation and platform-specific native advisories. PR #3's sandbox/CSP/frame/IPC restrictions reduce exposed features; they are not a substitute for a supported Electron runtime or proof of non-exploitability. |
| `extract-zip` | High | `electron → extract-zip`; archive symlink writes/traversal in Electron installation. WAH imports DOCX with Mammoth, not this extractor. Trusted/pinned Electron download reduces exposure, not an assertion of immunity. |
| `sprintf-js` | Moderate | `mammoth → argparse → sprintf-js@1.0.3` and `electron → @electron/get → global-agent → roarr → sprintf-js@1.1.3`; unbounded precision formatting. Registry has no fixed release on the inspected line. No learner-controlled format string was identified. |
| `argparse` | Moderate | Mammoth CLI dependency inherits sprintf-js. WAH calls Mammoth's API, not its command-line parser. |
| `mammoth` | Moderate | Parent record inherited from argparse/sprintf-js; not an independent remaining DOCX XML advisory. |
| `roarr` | Moderate | Electron download proxy logging inherits sprintf-js. |
| `global-agent` | Moderate | Download proxy support inherits roarr. |
| `@electron/get` | Moderate | Electron installer and builder binary downloading inherit global-agent. |
| `app-builder-lib` | Moderate | Inherits download/DMG/optional Squirrel findings; critical tar and direct high AppImage findings cleared. |
| `dmg-builder` | Moderate | Inherits app-builder-lib finding. |
| `electron-builder-squirrel-windows` | Moderate | Optional dependency inherits app-builder-lib; configured Windows target is NSIS, not Squirrel. |
| `electron-builder` | Moderate | Inherits the builder/download records above. |

Build-only exposure is still relevant to developer/CI machines, especially with
untrusted repositories, archives, configuration or publishing credentials. No
malicious archive exploitation was attempted against developer credentials or OS
files. No assertion of a vulnerability-free packaged application is made.

## Deferred major migrations and supported versions

- **Electron 31.7.7 → supported Electron:** registry candidate 44.9.0 requires
  host Node >=22.12; Electron supports only its newest three stable major lines.
  This is a substantial runtime migration across thirteen major versions, including
  changed Chromium permission/media/navigation behavior. Electron 44 raises the
  macOS minimum to 13 and drops Windows ia32; WAH targets x64/ARM64 but has not
  approved an OS-support change. Defer rather than force it. Highest-priority next
  task: select an explicitly supported line/OS baseline, review all intervening
  changes, and validate microphone, restored sessions and both packaged macOS apps.
- **Builder 26.15.3:** selected stable registry release. v27 documentation describes
  an ESM/API/config migration and is not applied. Although builder's top-level
  engine says >=14, locked `@electron/rebuild@4.2.1` requires >=22.12.0. Host Node
  engines are therefore `^22.12.0 || ^24.0.0`; CI now covers 22 and 24.
- **Node:** Node 24 LTS is recommended; Node 22.12+ LTS is supported by this tree.
  Node 20 is EOL and was removed from CI. The host Node version does not upgrade
  Electron's embedded Node runtime.
- **docx 9 / electron-store 12:** not needed to clear the addressed advisories;
  defer unrelated major API/ESM migrations. No new framework or persistence layer.
- **Mammoth:** npm proposes a downgrade to 0.3.29 for inherited sprintf-js exposure;
  this would discard years of reader fixes and is rejected. Track upstream instead.
  Do not downgrade builder to npm's suggested 26.5.0 either: this would restore
  already-remediated packaging vulnerabilities.

Sources: [Electron support](https://www.electronjs.org/docs/latest/tutorial/electron-timelines),
[Electron breaking changes](https://www.electronjs.org/docs/latest/breaking-changes),
[Node releases](https://nodejs.org/en/about/previous-releases),
[builder v26 changes](https://github.com/electron-userland/electron-builder/releases/tag/v26.0.0),
[builder v27 migration](https://www.electron.build/docs/migration/v27-breaking-changes/).
Registry metadata and the committed lockfile determine exact installed versions.

## Verification and reproducible Windows commands

```powershell
Set-Location 'D:\200 - WorkingatHeights\work-at-heights'
node --version # Node 24 LTS recommended; Node 22 must be >=22.12.0
npm.cmd ci
npm.cmd audit --json
npm.cmd audit --omit=dev --json
npm.cmd test
npm.cmd run test:electron
npm.cmd run dist:win -- --publish never
npm.cmd start
```

`npm audit` returns nonzero while advisories remain; this is expected, not a
successful clean security audit. Installation completed from the new lockfile.
Local Node tests: **58 passed, 0 failed**. Actual Windows Electron smoke: **22 passed,
0 failed**. CI also runs Electron smoke on Node 22/24 now, alongside Node tests.
The smoke exercises all seven stages, CSV/Word import, fallback, report/certificate
exports, restoration, certificate rejection, CSP, IPC and synthetic WAV loading.
Contract tests exercise repository Workers with fake upstreams; no live external
services, physical microphone, audible playback, native dialogs or browser launch
are claimed verified. No test expectation or assessment algorithm was relaxed.

Local Windows x64 NSIS packaging passed with builder 26.15.3 and `--publish never`.
The generated `Working at Height Learning Track Setup 0.7.0.exe` is 82,872,549 bytes
and Authenticode status is `NotSigned`. ASAR inspection confirms both question banks,
PapaParse and all required main/preload/renderer/security/HTML sources are present;
shipped application sources match the workspace.

The first CI run exposed a pre-existing smoke synchronization race: export controls
could already be enabled before a save finished. A second race involved the
existing 250ms email-triggered saved-session lookup resuming newly created progress
midway through an unusually fast synthetic run. The harness now lets that initial
lookup settle and waits for each actual export file; assertions and application
behavior are unchanged. Consider the delayed self-resume interaction separately
if it is observed with real rapid learner input. Local smoke passed after the fixes.
Initial packaging runs stopped at the test gate and created no installers/releases.
The corrected PR test run
[39067386896](https://github.com/agsiqueira/work-at-heights/actions/runs/39067386896)
passed both Node 22/24 jobs (58 Node tests and 22 Electron checks each). The final
manual packaging run is
[39067401896](https://github.com/agsiqueira/work-at-heights/actions/runs/39067401896)
at `0c4cfe0`, with both reusable test jobs passed. All three packaging jobs passed;
the `publish` job was **skipped**. Artifacts were verified through Actions metadata:

| Platform | Result | Artifact (ZIP archive size) |
| --- | --- | --- |
| Windows x64 NSIS | Passed locally and in Actions | [installers-windows](https://github.com/agsiqueira/work-at-heights/actions/runs/39067401896/artifacts/12113354703), 82,872,607 bytes |
| macOS Intel x64 DMG | Passed on macos-15-intel | [installers-mac-intel](https://github.com/agsiqueira/work-at-heights/actions/runs/39067401896/artifacts/12113373206), 107,916,864 bytes |
| macOS ARM64 DMG | Passed on macos-15 | [installers-mac-arm](https://github.com/agsiqueira/work-at-heights/actions/runs/39067401896/artifacts/12113394444), 101,863,756 bytes |

Mac builds disable signing identity discovery as in the existing workflow. No
signing/notarization credentials were introduced. These are validation artifacts,
not a published release. The final report-only commit does not change the tested
dependency graph, application sources, harness or workflow.

Building an installer is not proof that it
installs, launches correctly, is signed/notarized or passes Gatekeeper/SmartScreen.
No Worker deployment, release publication, tag or PR merge is authorized here.
