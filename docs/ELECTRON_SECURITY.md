# Electron security and assessment integrity

## Boundary and implementation

`src/renderer.js` uses DOM construction and `textContent` for learner, imported,
AI-generated and restored content. All former `innerHTML` assignments, including
static templates, were removed. No HTML sanitizer or remote script dependency is
needed. `src/index.html` denies inline/evaluated scripts, connections, frames,
objects, workers and forms through CSP; local scripts/styles/images and blob audio
remain permitted.

`src/main.js` explicitly enables the sandbox, context isolation and web security;
disables Node integration and webviews; denies new windows, redirects and foreign
navigation. A request allowlist permits only the actual application assets.
The file origin/default session is retained to preserve existing localStorage
restoration. Migrating to a custom protocol needs a separate storage migration.
Microphone permission callbacks allow audio only from the trusted main document;
camera and other permissions are denied.

Every IPC operation checks the registered WebContents, exact document URL, main
frame and argument count. The frozen preload exposes only named operations.
Existing service validators continue to bound chat/audio requests. External
opening permits only HTTPS `smartchats.info/course/whs`, with the existing learner
email correlation query. SmartChats authentication and README instructions are
unchanged.

Only native dialogs choose import/export paths. Export destinations must be
regular `.docx` files outside the application directory; existing symlinks and
nonregular targets are rejected. Native filesystem access still has a race between
validation and opening, and hard links are not an identity boundary. Do not treat
this as protection against an attacker already controlling the local OS account.

VR imports are limited to 8 MiB ZIP input, 1,000 entries, 8 MiB per expanded entry,
32 MiB total expanded content and 500,000 extracted characters. Archive traversal,
duplicates, encrypted/unsupported ZIP variants, VBA payloads, XML DTD/entities and
decompression overflows are rejected before Mammoth extraction. ZIP64 is not
supported. Parsing remains in the main process; process isolation is future work.
An empty structurally valid Word document remains accepted under existing policy.

## Certificate validation and compatibility

`src/security.cjs:validateEvidence` validates the native certificate operation,
independently of UI buttons. Missing completion flags, missing histories, changed
question-bank content, impossible adaptive sequences, invalid answer indices,
contradictory points, totals or classifications are rejected before the save dialog.
Scoring and progression in the renderer are unchanged; main-process verification
replays those same rules, including the mandatory Module 5 Expert quiz question.
Normal complete restored sessions remain exportable. Partial report exports remain
available with structurally valid evidence. Corrupt/legacy snapshots without the
necessary completion evidence can no longer generate a certificate merely by
setting completion flags; the learner must recover valid evidence or repeat stages.

No new passing grade, attendance requirement or minimum debrief turn count is
introduced. Existing zero-question SmartChats Expert classification, valid empty
VR import, unknown VR readiness handling and AI-directed early debrief completion
remain unchanged. Orientation completion is inferred from valid learner identity
and downstream completion for compatibility with prior snapshots.

**This does not authenticate assessment provenance.** An attacker controlling a
trusted renderer or local session storage can construct a fully self-consistent
history. Identity, CSV ownership, external VR results and AI scores are not signed
or independently attested. A future design should define authoritative completion
receipts/main-owned evidence and migration rules, or signed service-side records.
Changing eligibility (minimum grades, nonempty VR evidence, SmartChats attendance
or required debrief turns) needs an explicit product decision; none is implemented
here. Local certificate generation is not a credential-verification service.

Document IPC bounds include 2 MiB serialized evidence, 32,000 characters per
ordinary text field, 200-character learner names and bounded history lengths.
Over-limit values are rejected, not silently shortened; suggested export filenames
are capped at 80 characters. Invalid XML controls/unpaired surrogates become U+FFFD;
the Word library escapes XML metacharacters. Tests extract the generated documents
to verify Unicode, literal markup and 30,000-character content. Visual pagination
for extreme content is not verified. Failed saves show a fixed recovery message.

## Verification

Use Node 20 or 24 as covered by existing CI, then from PowerShell:

```powershell
Set-Location 'D:\200 - WorkingatHeights\work-at-heights'
npm.cmd ci
npm.cmd test
npm.cmd run test:electron
npm.cmd start
```

Local validation passed: `npm ci`, 58 Node tests (47 existing plus 11 security
tests), and 22 real Electron smoke checks. The Node suite directly
exercises caller, navigation, resource and permission rejection callbacks, malicious
URLs, invalid IPC/report payloads, actual Word libraries, certificate evidence and
restoration. The Electron smoke runs the actual main/preload/renderer and seven
stages, DOCX imports/exports, persistence, hostile markup, inline-script/network CSP
rejection and malformed privileged requests, using synthetic learner data.

External AI/network requests, native dialogs and browser launching are test doubles.
The blob-audio check loads a generated silent PCM WAV, without accessing devices
or playing audible output. Permission rejection is tested directly in Node.
Physical microphone/camera permissions, audible playback, macOS behavior, external
API availability, real native dialogs and packaged installers require separate
manual validation. Experimental fake-device microphone checks passed once but
stalled on repeated Windows runs; they are excluded from the standard suite to
avoid host-dependent failures. Production permission prompts were not verified.

Dependencies and lockfile are unchanged. `npm ci` succeeded and reported 23 existing
advisories (6 moderate, 16 high, 1 critical). Electron 31 and dependency security
updates require a separate compatibility-tested task. No Worker deployment, release
publication or eligibility-policy change is part of this work.
