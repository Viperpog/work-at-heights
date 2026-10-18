# Verified conference capture

Captured from main commit `699b8650655bcfa8141e9407d4271205531a441e` with an isolated synthetic session. No production files or learning rules changed.

Selected complete media directory on the capture machine:

`D:\200 - WorkingatHeights\work-at-heights\conference-media\2026-10-18T03-57-51-751Z`

Use this directory, not earlier partial/experimental runs. It contains 14 full-resolution 1920×1080 PNG screenshots covering all 12 requested stages, including the real portrait modal and voice-enabled state; seven H.264 MP4 clips; original frame sequences/timestamps; the certificate PDF; three exported assessment reports; synthetic CSV/DOCX inputs; saved session evidence; a 14-screen labeled contact sheet; and `manifest.json` with stage mapping and SHA-256 inventory.

Interaction clips cover instructor selection, initial question appearance, voice enablement, typed response and corrective feedback, quiz selection and answer reveal, beginning guided debriefing, and opening/exporting the certificate. All actions took place in the actual application. No cursor was composited.

## Verification

- `npm test`: 88 passed, 0 failed.
- Capture assertions passed through the complete assessment/export workflow.
- `verify.cjs`: 14 screenshots, seven MP4s, no missing stage/interaction assets; all saved assessment questions exactly match their banks; approved portrait asset hashes recorded; synthetic identity confirmed; actual PDF is one landscape page.
- FFprobe confirms every MP4 is 1920×1080 at 30/1 fps.
- Contact sheet visually checked: all 14 labeled thumbnails are visible. Full-size interview feedback, quiz feedback and certificate checked for legibility and layout; the remaining stage compositions reviewed in the sheet.

## Limitations and missing footage

Smooth continuous 30 fps screen recordings are not included. Windows FFmpeg exposes gdigrab, but this workflow samples the application surface to exclude desktop contamination. Actual source capture rates are approximately 3.9–7.6 fps; MP4s duplicate frames to achieve 30 fps encoding. Timestamped originals remain available. This is a technical limitation, not a claim of continuous recording.

No audio/microphone footage is included. Voice enablement is real, with speech output suppressed. Service fetches are blocked; interview evaluation and guided debriefing use the production offline fallback. The imported synthetic VR report is genuinely parsed and its offline-analysis notice remains visible. The certificate clip shows the app's own preview and actual PDF export, not a separate PDF viewer. Native chat scrolling and the app's existing status wording are preserved.

No requested stage is missing. External PDF viewer footage and smooth 30 fps recordings would be additional capture work. No promotional edit, deployment or merge was performed, and no media binaries are committed.
