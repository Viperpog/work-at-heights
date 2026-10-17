# Development microphone diagnostic

From PowerShell:

```powershell
Set-Location 'D:\200 - WorkingatHeights\work-at-heights'
npm ci
npm run diagnostic:microphone
```

This is a separate Electron entry point under `dev/`, excluded by the packaging
allowlist. It uses a temporary profile, a sandboxed isolated preload, exact
document/sender/resource allowlists, audio-only permissions and the existing
main-process service client/configuration. The normal learner app is unchanged.

1. Grant microphone permission to reveal input labels. Check the OS default label.
2. Record the displayed non-sensitive sentence using **System default**, then Stop.
3. Read the actual track label/settings and duration, bytes, MIME, sampled RMS/peak
   and approximate dBFS. Listen using the audio controls. Repeat with an explicit
   microphone selected. Device identifiers stay local and are not sent to the Worker.
4. Save locally if needed. Choose a **new filename outside the application** with
   the offered extension; existing files cannot be overwritten. No renderer path
   is accepted by IPC. WebM/Opus is preferred; MP4/M4A or Ogg is used if supported.
5. Only **Send to transcription Worker** transmits audio. The configured WAH voice
   endpoint and optional authentication apply unchanged. Text appears verbatim;
   it is never submitted to an assessment. Avoid sensitive speech.
6. Compare an intentional silent recording. Earlier live investigation returned
   `you` for silence, but recognized two different synthetic spoken sentences.
   Check the saved physical recording before drawing conclusions about credentials.

Input constraints, MIME preference, MediaRecorder, FileReader base64 and analyser
FFT/RMS match the learner recorder. Manual stop intentionally retains silence and
does not apply its automatic speech detection/assessment submission. Recording
stops after two minutes. The near-silent indicator is diagnostic, not an assessment
rule; statistics sample the analyser rather than decoding the entire saved file.

Cancel discards local audio and stops tracks, timers and AudioContext, and releases
playback/blob URLs. A previously sent transcription cannot be recalled; its result
is ignored after cancellation. Closing the window performs the same local cleanup.
Permission depends on Windows privacy settings and Electron's default input device.

```powershell
npm test
npm run test:electron
npm run test:microphone
```

Diagnostic automation uses synthetic tone/silent streams, a Windows-generated
spoken sentence when running on Windows, and a mocked Worker. It
checks constraints, labels, recording/playback/export, verbatim/empty/error responses,
permission denial, cleanup and IPC rejection. It does not establish physical device
selection, speech intelligibility, Windows permission behavior, or live credentials;
those require the manual steps above. No Worker, secret or assessment changes.

Local Windows verification: existing 58 Node tests and 26 Electron checks passed;
diagnostic checks passed (3 Node tests and 21 Electron checks), including synthetic
spoken audio. Live provider calls and the physical microphone were not exercised
by these tests. CI runs the additional diagnostic suite on Node 22 and 24.
