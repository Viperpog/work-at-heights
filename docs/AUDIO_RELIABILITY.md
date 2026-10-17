# Audio reliability and TOZO T6 validation

## Confirmed application changes

- Microphone settings now occupy a keyboard-accessible global header dialog;
  advanced local tests/playback are collapsed. The interview/debriefing retain
  their answer microphone buttons and existing short voice-status messages.
- The compact header gear uses background `#29405C` and icon `#FFFFFF`, including
  hover. Its specific selector overrides shared secondary-button colors.
- Answer recording is one press with automatic stop/transcribe/submit.
  `answerRecordingPolicy` centralizes RMS 10 (unchanged), minimum 2 s, sustained
  silence 4 s and no-speech timeout 15 s. Four seconds allows brief thinking pauses
  compared with the former 1.5-second cutoff; resumed speech resets the window.
  It is a conservative engineering default, not universal speech-end recognition.
  Two-/three-minute maxima, MIME order,
  transport, signal-presence detection and existing post-transcription assessment
  remain. Empty/no-signal and disconnected recordings do not submit answers.
- The previous global capture-phase button listener canceled narration for every
  button, including unrelated controls. Cancellation is now limited to relevant
  learner actions plus explicit navigation/mute/voice changes/new prompts.
- Starting capture now cancels pending/playing narration. Playback is suppressed
  during microphone acquisition/recording. Identical active speech requests are
  coalesced; obsolete synthesis success/failure cannot change current status or
  start fallback. New prompts cancel obsolete playback and release its blob URL.
- The stopping/transcribing guard is set before recorder.stop(), preventing rapid
  restarts in the gap before its asynchronous stop event. Navigation discards
  capture; disabling voice/navigation also cancel pending capture acquisition.
  Early manual stop remains optional. Completing interviewer playback never
  activates the microphone automatically.

These fixes have regression evidence. They do not prove TOZO playback is resolved.
The user's latest report describes irregular TOZO dropouts and successful Bose
playback. WAH requests a complete audio response
per prompt, not timed 1.5-second playback chunks. No TTS provider/key changes.

## Development-only event diagnostics

```powershell
Set-Location 'D:\200 - WorkingatHeights\work-at-heights'
$env:WAH_AUDIO_DIAGNOSTICS = '1'
npm start
# After testing:
Remove-Item Env:WAH_AUDIO_DIAGNOSTICS
```

Open Electron Developer Tools (Ctrl+Shift+I), Console, and filter `[WAH audio]`.
The main process enables this flag only in an unpackaged development run. Logs
contain event timing, phase, request counters, cancellation reasons, unexpected
pauses, completion/error, repeated-request suppression and capture/playback overlap
prevention. Capture events include sample rate, channels and processing flags
(echo cancellation, noise suppression, automatic gain), when reported. No text,
device IDs/labels, credentials, conversation content or audio is logged. There is
no telemetry upload. Inspect only these events when sharing diagnostics.

Phases are idle, preparing, speaking, recording, transcribing and playback error;
fallback/recovery settles the active operation. Request identifiers remain the
existing lifecycle mechanism. Synthesis requests already in flight are bounded
by the existing service timeout; cancellation invalidates results rather than
recalling the provider request. No extra IPC or relaxed CSP is introduced.

## Bluetooth findings and physical protocol

**User-reported physical comparison:** TOZO T6 produced irregular interviewer
dropouts when used for both input and output; Bose playback worked without those
dropouts. Treat the tested TOZO T6/current Windows/WAH combination as incompatible
for now and try Bose or another headset if affected. This is not a universal
Bluetooth or TOZO-product defect and does not establish a driver/profile cause.
There is no device blocking, brand-specific code, TTS provider/model/codec/key
change, or automatic Windows change. Bose success is the user's hardware evidence,
not an additional automated or agent-performed listening test.

Windows Bluetooth Classic normally uses A2DP for stereo playback and HFP for
microphone plus mono playback. Activating capture can therefore change the audio
format/routing. Newer LE Audio configurations can behave differently. This is a
plausible cause, not a measured TOZO finding. See Microsoft's
[audio format guidance](https://learn.microsoft.com/en-us/windows/win32/coreaudio/communications-audio-format-capabilities).

No physical routing/profile switch, endpoint transition, sample-rate change or
earbud interruption was independently measured in this implementation. Browser track settings
describe the capture stream, not authoritative Bluetooth radio/driver profiles.
Echo cancellation/gain/noise processing remain at the original browser defaults;
do not infer profile switching solely from their values or a quality change.

Run the following comparisons manually, keeping volume, instructor and a similar
prompt constant. Change Windows output yourself; WAH does not change OS settings.
Close other applications that may hold headset capture. Use synthetic/non-sensitive
sentences and record whether each interruption aligns with a WAH cancellation or
unexpected-pause event. Do not send a full private DevTools log.

| Case | Windows output | WAH selected input | Observe |
|---|---|---|---|
| A | TOZO | TOZO | Prompt before capture; start/stop input; next prompt |
| B | TOZO | Integrated/USB mic | Whether breaks remain without TOZO capture |
| C | Computer speakers | TOZO | Whether capture itself remains continuous |
| D | TOZO | No active capture | Prompt uninterrupted with input inactive |

For each: select the input in the gear panel, open Advanced, record/play a local
sentence, then discard/close settings so all test tracks stop. Confirm the actual
track label. Listen to a full interviewer prompt. Record an answer with a 2–3 second
thinking pause; ensure recording continues, then finish speaking and allow four
seconds of silence to stop/transcribe/submit once without a second click. Repeat
in debriefing. Confirm smooth subsequent prompts and
restart WAH to check preference persistence. Disconnect/reconnect the selected
mic and verify the explicit unavailable state without fallback.

If D is smooth but A fails and B is smooth, capture-related Bluetooth routing is
more likely; correlate with Windows Sound endpoint/format observations. If breaks
also occur in D, investigate playback cancellation/error events and compare saved
developer-diagnostic audio on an alternative output. No cancellation event does
not rule out driver/network/provider problems; the diagnostics do not observe
the radio directly. Do not rotate credentials or switch providers based on an
incorrect transcript alone.

## Automated evidence and limits

`npm ci` completes with unchanged dependency versions (10 existing moderate audit
advisories). Baseline: 58 Node tests and 26 Electron checks. Microphone suite:
9 Node tests, 21 standalone diagnostic checks, 52 learner Electron checks.
Real Electron uses synthetic device/audio fixtures and mocked services; Node
playback tests use controlled audio doubles. Max-duration tests invoke captured
timer callbacks with original durations; they do not wait two/three minutes.
Two-second thinking pauses, deterministic four-second boundary/reset checks,
automatic transcription and actual answer processing through existing fallback,
no-speech callbacks, exact gear colors, keyboard Escape/focus, empty audio, denial/disconnection,
duplicate starts, stale requests, fallback, cleanup and unchanged security/session
restoration are covered. Hardware listening, real TOZO input/output combinations,
driver behavior and live services remain unverified. Nothing merged/deployed.

One initial learner-suite run timed out waiting for synthetic local-test analyser
input. An unchanged rerun and the full clean-install verification passed; no
assertions were weakened. Host audio initialization can still affect synthetic
runtime checks. Physical Bose/TOZO findings above remain user-reported evidence.
