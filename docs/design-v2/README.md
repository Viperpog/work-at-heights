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
- Node regressions: **68 passed, 0 failed**.
- Electron regressions: **101 passed, 0 failed** (26 workflow/security smoke,
  4 runtime, 19 corrective-feedback, 52 design integration checks).
- Microphone regressions: **86 passed, 0 failed** (9 Node, 21 developer diagnostic,
  56 learner checks). All existing assertions are retained.
- Windows x64 NSIS non-publishing build and archive validation: passed. The
  validator checks Electron 44.9.0 and exact source bytes for CSS, all new assets,
  all four instructor PNGs and the bundled font/license.
- Built `app.asar` in real Electron: **26 smoke + 52 design checks passed**.
  The development Electron executable runs the packaged main/preload/renderer;
  this is distinct from installing and launching the NSIS installer.
- **24 actual Electron screenshots** are included for review. Screenshot capture
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
