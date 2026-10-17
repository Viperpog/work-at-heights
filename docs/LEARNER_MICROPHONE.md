# Learner microphone selection and local testing

Launch the learner application normally:

```powershell
Set-Location 'D:\200 - WorkingatHeights\work-at-heights'
npm ci
npm start
```

Open the **Audio settings** gear in the global header from any stage.
The primary panel contains **Your microphone**; testing controls are inside the
collapsed **Advanced: test microphone** section. Use
**Show / refresh microphones** to grant audio access and reveal device names.
Choose the headset, USB, integrated or virtual input you intend to use. System
default identifies the operating system's default input when the browser exposes
its label. **Microphone used** shows the actual acquired audio track label, which
can differ from the default-device alias. Instructor/persona choice is separate.

Choose **Test microphone**, say the displayed sentence, then **Stop test**. Listen
using the audio player. Tests stop after ten seconds; **Discard test** or navigation
releases the test. Both stages share the selection and test playback. Test audio
stays local and is never automatically transcribed or submitted. There is no
learner test-transcription button; the separate developer diagnostic retains its
explicit transcription/export controls.

Close with Close or Escape; focus returns to the gear. Closing cancels/discards
any local test. Testing controls no longer occupy the interview/debriefing.

The selected device ID is stored in localStorage under `wah.microphoneDeviceId`,
outside learner session data. No labels, audio or device settings are persisted.
Choosing System default removes the saved ID. Explicit selection uses
`{audio:{deviceId:{exact:selectedId}}}`; otherwise the original `{audio:true}` is
retained. Device IDs never enter the provider request or report/session exports.
If browser privacy settings reset device IDs, reconnect/select the device again.
Storage failures retain the current choice in memory and show a message.

Disconnected/stale choices remain selected and show an unavailable option; there
is no automatic fallback. A `devicechange` event refreshes the list. Losing an
active track cancels that recording, discards incomplete audio and prevents answer
transcription. Check the selected input, reconnect it, or explicitly choose another.
Permission denial points to Windows microphone privacy settings; unavailable or
busy devices get a separate message. If the test reports no input, check mute and
input volume and listen to the local recording. An incorrect transcript by itself
does not demonstrate an API authentication failure.

Normal answers keep their existing MIME preference, FileReader/base64 transport,
recording limits, transcription endpoint, automatic submission after transcription,
and assessment behavior. **Answer recording now uses manual start/stop:** press the
microphone to start, speak with natural pauses, and press it again to stop/send.
The previous pause-triggered stop and nine-second no-speech stop were removed.
Maximum duration is still two minutes for interview / three for debriefing. Signal
detection remains to reject empty/no-input recordings; it no longer ends answers
on silence. Navigation discards an active recording. A local test deliberately
retains silence so it can be inspected. Its sampled
peak indicator is diagnostic only. No IPC, CSP, credentials, Worker, provider or
scoring changes were needed. Existing speaker/instructor voice behavior remains;
starting a local test stops current narration to avoid recording it.

## Verification

`npm ci` completed (after closing the diagnostic window that locked Electron).
The lockfile and dependency versions are unchanged; npm reported the existing
10 moderate advisories, with no dependency remediation attempted here.

- `npm test`: 58 passed, 0 failed. One existing fixture now supplies the standard
  `MediaStream.getAudioTracks()` method; its assertions are unchanged.
- `npm run test:electron`: 22 smoke + 4 runtime checks passed, 0 failed.
- `npm run test:microphone`: 8 Node tests (including 5 playback lifecycle tests) +
  21 developer diagnostic checks + 39 learner integration checks passed, 0 failed.

The learner suite runs the actual main/preload/renderer with synthetic input
devices/audio and a mocked provider. It checks default/exact constraints, shared
selection, localStorage restoration after real renderer reload, stale preference,
device changes/track loss, permission denial, local silence/playback, cleanup and
absence of provider calls during tests. Existing security assertions remain.
Automated permission denial and disconnection are fixtures, not actual OS events.

Manual follow-up on the affected Windows computer: select TOZO T6, test and play
back a sentence, restart the application and confirm the same choice, record an
interview and debriefing answer, then disconnect/reconnect the headset and confirm
there is no silent fallback. This change has not independently reverified physical
hardware, full process-restart preference restoration, Bluetooth behavior or live
transcription. The user reported successful TOZO recording/live transcription in
the previous diagnostic; that is background evidence, not a new automated result.
