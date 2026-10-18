# Modern Industrial Learning v2

Implemented in native HTML/CSS/JavaScript from the approved [Figma review canvas](https://www.figma.com/design/V7F5upd1HOTEHGJgyo31qS?node-id=12-2).
Started from main `ed64b27`, which includes the corrective feedback and approved portrait updates.

## Screen review

The Figma integration supplied design context and rendered screenshots for every
visible frame below. The implementation screenshots are captured from the actual
Electron BrowserWindow at a **1440 × 900 content viewport**, using an isolated
profile, synthetic learner details, actual question-bank text, and mocked services.
They are not Figma exports, browser mockups, or evidence of live-service/hardware testing.

| Checkpoint | Figma node | Implemented screen / actual Electron capture |
| --- | --- | --- |
| A | 22:2 | [Welcome](screenshots/00-welcome.png): two-part hero, exact industrial image, journey and progress-saving reassurance |
| A | 3:3 | [Orientation](screenshots/01-orientation.png): exact atmospheric image, learner details, SmartChats and ebook cards |
| B | 3:69 | [SmartChats empty](screenshots/02-smartchats-empty.png), [loading](screenshots/02a-smartchats-loading.png), [read error](screenshots/02b-smartchats-error.png), [actual CSV results](screenshots/02-smartchats-results.png) |
| B | 6:12 | [Instructor selection](screenshots/03-instructor-selection.png): four original PNGs, rounded masks, selected indicator |
| B | 3:137 | [Interview](screenshots/04-interview.png), [voice enabled](screenshots/04a-interview-voice.png), [corrective feedback](screenshots/04b-interview-feedback.png) |
| B | 3:196 | [Quiz question](screenshots/05-quiz-question.png): real module, difficulty, question and options |
| B | 25:2 | [Incorrect answer review](screenshots/05a-quiz-incorrect.png), [correct answer review](screenshots/05b-quiz-correct.png): selected/correct labels, explanation and next action |
| C | 3:256 | [VR import](screenshots/06-vr-import.png), [results](screenshots/06a-vr-results.png): separate VR workflow, DOCX import and reflection bridge |
| C | 12:5 | [Facilitator selection](screenshots/07-facilitator-selection.png) |
| C | 3:309 | [Debriefing](screenshots/08-debriefing.png), [voice enabled](screenshots/08a-debriefing-voice.png) |
| C | 3:362 | [Certificate](screenshots/09-certificate.png): actual learner/readiness, double gold border, original DOCX download/retake actions |
| D | Existing functional states | [Narrow instructor modal](screenshots/10-narrow-modal.png), [audio settings](screenshots/11-audio-settings.png), responsive checks at 1440/1024/760/480px |
| D | Restored completion states | [Interview report](screenshots/12-interview-complete.png), [quiz report](screenshots/13-quiz-complete.png), [debriefing report](screenshots/14-debrief-complete.png) |

Visual comparison covered shell composition, typography, teal/navy/warm-white
colors, portrait crops, spacing, selected/correct/incorrect states and dark/light
transitions. Comparison fixes included an over-broad dark-text selector, compact
orientation/quiz spacing, keeping the response composer visible with scrollable
history, and fitting the certificate's download action below the document.

## Design adaptations to real behavior

- The seven existing navigation buttons now form the left rail. Their identifiers,
  disabled gates and handlers remain. The former learner/readiness status details
  remain in a disclosure below the rail's progress indicator.
- Stage and module bars represent **current stage/module**, not a fabricated
  percentage of completion. Adaptive question counts are not known in advance.
- SmartChats shows the real count, classification and existing summary. The
  mockup's illustrative category percentages/bars are omitted because the current
  classifier does not produce those measurements. Empty imports retain the
  existing classification policy; CSV warnings are informational only.
- Conversation history, opening messages, corrective feedback, skip, microphone,
  change-instructor, mute and report/export actions are retained even where the
  mockup simplifies the conversation to one question. History scrolls; real text
  and unusually long questions may make the page taller than a static frame.
- Voice is initially off, following the existing application behavior. The mockup's
  “ON” labels are not initial state. Voice-enabled captures use actual toggle
  handlers with narration mocked. The Figma debriefing sample pairs Beatrice's
  name with Jake's image; WAH consistently shows the selected instructor's own
  name, image and voice.
- The existing audio-settings button retains its established `#29405C` color,
  white text color and accessible behavior, with the approved gear asset.
- VR stays a separate experience; this application imports its Word report.
  Actual report analysis, status and continue control add content beyond the
  static import-only example.
- The certificate title now matches the real DOCX title. The preview uses real
  state and the unchanged readiness function. Full assessment metadata and the
  existing readiness message remain available under completion details below it.
  DOCX generation, evidence validation and eligibility have not changed. The
  preview is HTML, not a byte-identical rendering of the exported Word document.
- Small windows use a horizontally scrollable stage rail and stacked content.
  Content grows and scrolls rather than truncating actual learner text or reports.

## Local assets and implementation

`src/styles.css` replaces the accumulated old overrides with one token-based
stylesheet and explicit responsive layouts. No framework or bundler was added.
`src/index.html` keeps all existing IDs and event handlers. Renderer additions are
presentation helpers, CSV loading/read-error messages and quiz review classes.
Scoring, question banks, adaptive decisions, feedback generation, sessions, audio
logic, IPC and exports are unchanged.

Exact Figma exports under `src/assets/design-v2/`:

- `welcome-training.png`: welcome image, node 22:10.
- `orientation-safety.png`: atmospheric orientation band, node 3:35.
- `gear.svg`, `book.svg`, `voice.svg`, `mute.svg`, `microphone.svg`: approved local icons.
- `Inter.ttf`: Inter variable font from the Google Fonts `ofl/inter` distribution;
  its SIL Open Font License is bundled in `Inter-OFL.txt`.

The four approved instructor PNGs in `src/assets/instructors/` are unchanged.
No temporary Figma URLs or remote font requests exist in application code. CSP
is unchanged; `resourceAllowed()` adds only the specific image/font paths.
Screenshots are review artifacts and are excluded from the installer.

## Repeatable verification

```powershell
Set-Location -LiteralPath 'D:\200 - WorkingatHeights\work-at-heights'
npm.cmd ci
npm.cmd test
npm.cmd run test:electron
npm.cmd run test:microphone
npm.cmd run dist:win -- --publish never
node test/validate-packaging.cjs
```

Capture the real UI (synthetic profile, no external AI):

```powershell
$env:WAH_VISUAL_OUTPUT = Join-Path $PWD 'docs\design-v2\screenshots'
try {
  & .\node_modules\.bin\electron.cmd test/design-system-electron.cjs
} finally {
  Remove-Item Env:WAH_VISUAL_OUTPUT -ErrorAction SilentlyContinue
}
```

The visual runner disables GPU acceleration **only in the test process** so
Electron's compositor can capture screenshots in this environment. The production
main-process configuration remains unchanged. It waits for font loading, image
decoding, animation frames and the existing saved-session lookup, without adding
delays to production code. Complete workflow/import/export and security tests
remain in `electron-smoke.cjs`; visual fixtures do not replace those tests.

To run against the built archive, set `WAH_PACKAGED_APP` to
`dist\win-unpacked\resources\app.asar` before running `electron-smoke.cjs` or
`design-system-electron.cjs`, then remove the environment variable afterward.
The archive checks compare every new asset's packaged bytes with its source.

## Verification results

- Clean `npm.cmd ci`: passed; Electron 44.9.0 and unchanged dependency lockfile.
  Existing audit output remains 10 moderate advisories.
- Node regressions: **74 passed, 0 failed** (including 6 asynchronous recovery tests).
- Electron regressions: **132 passed, 0 failed** (26 workflow/security smoke,
  4 runtime, 19 corrective-feedback, 52 design integration, 31 branded-modal checks).
- Microphone regressions: **86 passed, 0 failed** (9 Node, 21 developer diagnostic,
  56 learner checks). All existing assertions are retained.
- Windows x64 NSIS non-publishing build and archive validation: passed. The
  validator checks Electron 44.9.0 and exact source bytes for CSS, all new assets,
  all four instructor PNGs and the bundled font/license.
- Built `app.asar` in real Electron: **26 smoke + 52 design + 31 modal checks passed**.
  The development Electron executable runs the packaged main/preload/renderer;
  this is distinct from installing and launching the NSIS installer.
- **29 actual Electron screenshots** are included for review. Screenshot capture
  works with the visual runner's software rendering configuration.
- During development the new visual harness raced the existing saved-session
  lookup when run without screenshots. It now waits for that callback explicitly;
  production session code and timing were not changed.

## Remaining limits

Windows desktop/Electron is the verification target. macOS packaging, installed
installer operation, physical microphone/acoustic behavior, live transcription,
live AI evaluation and educational-quality review are outside this visual test.
Existing npm advisories are not changed by this work. Real data can cause more
wrapping and scrolling than the static Figma samples. Human design review of the
checked-in captures remains appropriate before merging.

## Branded modal follow-up

Approved sources: [Welcome Back, 30:2](https://www.figma.com/design/V7F5upd1HOTEHGJgyo31qS?node-id=30-2),
[Reset Confirmation, 30:123](https://www.figma.com/design/V7F5upd1HOTEHGJgyo31qS?node-id=30-123),
and [Information/Error, 30:243](https://www.figma.com/design/V7F5upd1HOTEHGJgyo31qS?node-id=30-243).
All three were inspected through design context and Figma screenshots before implementation.

| Approved variant | Actual Electron screenshot |
| --- | --- |
| Dark recovery | [Welcome back](screenshots/15-modal-welcome-back.png) |
| Dark reset warning | [Start a new training session?](screenshots/16-modal-reset-confirmation.png) |
| Light CSV error | [Unable to read the CSV](screenshots/17-modal-csv-notice.png) |
| Responsive variants | [Light notice](screenshots/18-modal-narrow.png), [dark reset](screenshots/19-modal-reset-narrow.png) |

The dark surface is 590px wide with a 420px minimum height; the light surface is
560px wide. Both use the approved 20px corners, 54px icon plate, 96px accent,
48px buttons and 63% navy overlay. Typography, supporting panels, warning tint
and button hierarchy follow the frames. Existing Inter/teal tokens and local
shell imagery are reused; the icons here are the exact text glyphs from Figma.
No new remote images are needed. Real learner names/stages replace illustrative
Figma data. Content grows and scrolls as needed; narrow windows stack actions.
Captures show the required visible keyboard focus ring. The underlying page's
scrollbar can shift its available viewport center relative to a static Figma frame.

### Architecture and interaction

`src/dialogs.js` owns one renderer-only HTML `dialog` in the browser's top layer.
Its frozen `window.wahDialogs` interface provides promise-based `showInfo`,
`showConfirm`, and `showSessionRecovery` operations. Calls queue rather than
stack; button/keyboard/programmatic close paths settle promises once. One fixed
listener set serves all invocations, so opening/closing never accumulates handlers.
No IPC, privileged API, HTML interpolation or changes to OS chooser security are
introduced. All title/body/detail text uses `textContent`.

- Focus starts on the primary action and Tab/Shift+Tab remain inside. Top-layer
  modality prevents underlying controls taking focus or input.
- Closing returns focus to a still-visible trigger, or the active stage control
  when the trigger no longer exists/is hidden. A temporarily disabled retake
  button is reenabled before its focus is restored.
- Enter activates the focused action/default primary. Reset defaults to **Keep
  My Progress**, never the destructive action.
- Welcome Back requires an explicit Continue/Start New choice: Escape is ignored.
  Backdrop clicks never dismiss or choose any modal action.
- Escape dismisses informational notices. On reset it means Keep My Progress.
  During recovery this returns to Welcome Back without changing state/storage.
- CSV error's **Choose Another CSV** requests the existing native file input.
  Escape dismisses the notice without opening a chooser. Inline recovery guidance
  stays visible, and no classification/completion is awarded for a read error.

### Dialog inventory

All **11 renderer alerts and the one native recovery confirmation** are replaced:

| Original application-controlled dialog | Branded replacement |
| --- | --- |
| Saved-session confirmation | Dark Welcome Back with real learner/unfinished stage |
| Start-over/retake decision | Approved dark reset confirmation before the existing reset operation |
| Document save/generation failure | Light error with original recovery message |
| Empty interview response / evaluation failure | Light notice; failed evaluation still retains answer/question and awards no credit |
| Missing quiz choice | Light notice; no history or points added |
| Empty debrief reflection | Light notice; no progression |
| Invalid/unreadable VR Word report | Light error; original recovery message retained |
| Ebook, interview, quiz, debrief, certificate save success | Light saved notice with original destination text |
| CSV read error (previously inline) | Approved light CSV error + native file-selection retry; inline text remains |

No `prompt`, application-controlled Electron message-box or error-box call sites
were present. Existing inline microphone/permission/transcription guidance and
diagnostic output stay inline; adding interruptions there would change the audio
experience. Learner validation still uses its existing disabled-control rules.

**Intentionally native:** CSV file input chooser, Electron VR report open dialog,
ebook/report/certificate save dialogs and OS microphone permission prompts.
`src/main.js`, `src/preload.js`, file/path/evidence validation and service clients
are unchanged. CSP is unchanged; the exact resource allowlist adds only `src/dialogs.js`.

### Necessary asynchronous-flow adaptations

The recovery eligibility, unfinished-stage calculation, restored state, session
format and reset implementation are unchanged. While the existing delayed lookup
or recovery decision is pending, orientation actions/session writes are held so
a quick click cannot overwrite saved progress before deciding. This also applies
when a valid email is entered before the learner name. Duplicate lookups share
one decision, and a stale decision cannot apply a different learner's record.
The guard is transient and does not add persisted session fields.

The approved second reset confirmation is new presentation protection around the
**same** reset operation. Continue calls the existing restore/save path; confirmed
Start New calls the existing clear/reset path. Keep makes no state/storage change.
Retake also uses this confirmation and rejects duplicate clicks while awaiting it.
Microphone preferences and other learners' records are retained. Export notices
are awaited after the same existing successful save/gate updates; canceled native
choosers still produce no notice. These adaptations have focused unit/real-renderer tests.

### Modal verification

The 6 added Node tests cover pending writes, actual restoration, Keep/Start New,
unrelated settings/sessions, absent/malformed records, duplicate lookups and stale
inputs. The 31 real-Electron checks cover modal text/variants, mouse and complete
keyboard events, focus/inertness, safe Escape/backdrop, queues/programmatic close,
HTML injection, actual quiz validation, CSV retry, retake, Word-import errors,
responsive geometry and native chooser cancellation. Existing suites dismiss
incidental notices through the real modal action; they fail if native alert/confirm
is used. Existing assessment/security assertions were not removed or relaxed.

To capture only the modal screens, use the same `WAH_VISUAL_OUTPUT` setting above
and run `electron test/dialogs-electron.cjs`. This runner also accepts
`WAH_PACKAGED_APP`; packaging validation now compares `src/dialogs.js` byte-for-byte.
The complete native file-picker interaction is mocked in automation; chooser
security/operation still uses the existing handlers and existing import/export tests.
