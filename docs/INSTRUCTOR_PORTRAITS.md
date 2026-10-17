# Instructor portrait update

The four PNG files in `src/assets/instructors/` are byte-for-byte copies from the
approved `wah-instructor-portraits.zip`. No image generation, recompression, or
appearance edits were applied. Together they occupy 1,847,138 bytes.

| Instructor ID | PNG | Existing voice |
| --- | --- | --- |
| jake | jake-miller.png | cedar |
| emily | emily-carter.png | sage |
| carlos | carlos-rivera.png | onyx |
| beatrice | beatrice-johnson.png | shimmer |

Cards retain their existing 4:3 frame, rounded corners and selection indicators.
Small header avatars retain their existing 54px/46px sizes and now use the same
top-centered cover framing as the cards. Images are local; the exact resource
allowlist now permits these PNG paths instead of the obsolete SVG paths. CSP,
personas, prompts, voices and application behavior are unchanged.

## Validation (Windows x64, Electron 44.9.0)

- `npm ci`: passed after closing the repository's running WAH window and retrying
  with network access for Electron installation. Existing audit: 10 moderate.
- `npm test`: 58 passed, 0 failed (current main baseline).
- `npm run test:electron`: 26 smoke + 4 runtime checks passed, 0 failed.
  Four added checks select each instructor through the modal and verify PNG
  decoding, card/modal/header references, accessible labels, persona ID and voice.
- `npm run test:microphone`: 9 Node + 21 diagnostic + 56 learner checks passed,
  0 failed. Synthetic audio/devices and mocked providers, not physical hardware.
- `npm run dist:win -- --publish never`: Windows x64 NSIS build passed.
- `node test/validate-packaging.cjs`: installer exists, Electron is 44.9.0,
  and all four packaged PNGs match the source files exactly.
- Real Electron smoke checks using packaged `app.asar`: 26 passed, 0 failed.
  Main/preload/renderer and resources load from the archive; test runner uses the
  pinned development Electron executable and isolated synthetic learner profile.
  Native dialogs and external AI remain mocked. Installer installation was not tested.

To repeat the packaged renderer check in PowerShell after building:

```powershell
$env:WAH_PACKAGED_APP = Join-Path $PWD 'dist\win-unpacked\resources\app.asar'
try {
  & .\node_modules\.bin\electron.cmd test/electron-smoke.cjs
} finally {
  Remove-Item Env:WAH_PACKAGED_APP -ErrorAction SilentlyContinue
}
```

Screenshot capture was attempted but Electron returned `UnknownVizError`; no
before/after screenshots are supplied. Source images were visually inspected;
full responsive visual inspection and macOS packaging were not performed.
No release was published and nothing was deployed.
