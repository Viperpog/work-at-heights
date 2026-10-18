# Conference footage capture

Run from the repository root on Windows with dependencies installed (`npm ci`), Node matching package.json, and FFmpeg on PATH:

```powershell
New-Item -ItemType Directory -Force conference-media | Out-Null
Start-Process -FilePath (Resolve-Path node_modules/electron/dist/electron.exe) -ArgumentList 'tools/conference-capture/capture.cjs' -WindowStyle Hidden -Wait -RedirectStandardOutput conference-media/capture.log -RedirectStandardError conference-media/capture-error.log
Get-Content conference-media/capture.log
```

Each run creates `conference-media/<UTC timestamp>/`. An optional absolute `WAH_CAPTURE_OUTPUT` selects another output folder. Check the process log and require a manifest with `verification.completeSession: true` and no `error` before using any run. Failed runs are partial and must not be used as complete deliverables.

Run `node tools/conference-capture/verify.cjs conference-media/<UTC timestamp>` after capture. This checks the saved assessment questions against both banks, synthetic identity, every MP4's dimensions/frame rate and the exported PDF page count/orientation. It adds a complete SHA-256 file inventory and hashes of approved bundled portrait assets to the manifest. FFprobe must be on PATH for this verification.

The manifest identifies stage, source, dimensions and media type. Outputs include full 1920×1080 application PNGs, MP4 interaction clips, original timestamped frame sequences, synthetic CSV/DOCX inputs, exported reports, the actual PDF certificate, session evidence and a labeled contact sheet. `conference-media/` is ignored by Git; do not commit it. No finished promotional video is produced.

## Provenance and isolation

This launches the actual `src/main.js`, preload, renderer, styles and bundled portraits. It reuses the notice helper from `test/dialog-test-helpers.cjs` and follows `test/design-system-electron.cjs`, `test/electron-smoke.cjs` and `test/pdf-certificate-electron.cjs`. Unlike unlocked visual fixtures, the capture proceeds through the learning workflow, report exports, adaptive scoring, DOCX import and certificate readiness checks. `test/helpers.cjs`'s completed-state fixture was inspected; it is unnecessary because this capture completes its own synthetic session.

The profile is temporary. Main-process fetch always throws before making a network request; external browser launches are suppressed. The real offline evaluation, VR import fallback and guided debriefing run. Native file dialogs select synthetic inputs and temporary export destinations. Production security still rejects source-directory exports, so completed reports are copied into the local output folder. The harness fixes question selection randomness for repeatability but does not change scoring or question data. Speech output alone is suppressed, following the existing visual harness; voice enablement is captured but no live TTS, microphone, or audio is used.

## Recording and review

FFmpeg on the capture machine supports Windows gdigrab. We use application-only `webContents.capturePage` to exclude desktop windows, banners and cursor artifacts. During each real action, a loop captures PNGs with monotonic timestamps. FFmpeg preserves their timing and encodes 1920×1080 H.264 at 30 fps. These are **sampled interaction videos**, not continuous 30 fps screen recordings. Consult each clip's measured sampling rate in the manifest; duplicate frames fill the 30 fps output. If encoding is unavailable, original sequences remain and the manifest lists missing MP4s. No cursor is added and no UI is reconstructed.

The certificate PNG shows the app's certificate preview; `certificate.pdf` is the real landscape A4 Chromium export. It is not footage of an external PDF viewer. Instructor close-up is the real selection modal at the same full resolution. Some long conversations have native internal scrolling; supplemental screenshots should be taken by scrolling the actual app if the entire conversation must be shown.

Before editorial use, inspect the contact sheet and full PNGs at 100%. Check portrait files against `src/assets/instructors/`, feedback against the saved session's bank questions, synthetic identity against the certificate, readable text and viewport clipping. Automated checks verify dimensions, loaded images, actual incorrect feedback, bank explanation, real DOCX import, certificate identity and PDF signature. They do not replace human educational review or imply certification competence. Skipped interview answers and one incorrect quiz answer are deliberate and retained in session evidence.
