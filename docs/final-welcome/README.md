# Final welcome screen — current Figma 22:2

Based on main `a994705` (merged PR #10). Only the welcome section and its CSS
change in production. `src/renderer.js`, navigation, session storage/recovery,
modals, assessment rules, audio, PDF export, preload, IPC and security are unchanged.

## Current source and comparison

Retrieved the **current** [approved frame 22:2](https://www.figma.com/design/V7F5upd1HOTEHGJgyo31qS?node-id=22-2)
and image field `22:10` through Figma design context, including their screenshots,
text, sizes, colors and current image download. The reference below is that newly
retrieved screenshot, not a previous v2 capture.

- [Side-by-side: current Figma / actual Electron](comparison.png)
- [Current Figma reference](figma-22-2.png)
- [Actual Electron, 1440 × 900 content viewport](electron-1440x900.png)
- Smaller windows: [1280](electron-1280x900.png), [1024](electron-1024x900.png),
  [760](electron-760x900.png), [480 top](electron-480x900.png),
  [480 lower section and Begin Training](electron-480x900-lower.png)

The comparison resizes the Electron capture to the integration's 1024 × 640
reference solely to place both side-by-side; the original 1440 × 900 PNG is retained.
Screenshots are actual Electron renders. Only providers and native chooser responses
in the existing regression runner are synthetic; the welcome screen has no provider call.

## Exact copy

- WORK AT HEIGHTS
- NR-35 / SAFETY TRAINING EXPERIENCE
- Work at / Heights
- NR-35 Safety Training
- TRAIN FOR / WHAT MATTERS.
- Learn to identify hazards and make safer decisions with an immersive multimodal experience powered by AI.
- LEARN — Discover the essentials — Learning modules, SmartChats and ebook
- DEMONSTRATE — Test your judgment — Safety interview and quiz
- REFLECT — Connect practice to action — Virtual reality and guided debriefing
- Begin Training →

Removed the earlier welcome lead, step badge, simulation label and saving note,
which are absent from the current approved frame. The arrow is decorative and the
existing `beginTrack` ID/event handler are retained. User-facing welcome branding
is Work at Heights; internal names and other screens are intentionally unchanged.

## Geometry and image treatment

At a 1440 × 900 content viewport the automated checks compare:

| Element | Figma x/y | Width × height |
| --- | --- | --- |
| Main card | 69 / 111 | 1302 × 716 |
| Right image container | 853 / 111 | 518 × 462 |
| Journey strip | 95 / 580 | 1250 × 137 |
| Begin Training | 104 / 758 | 322 × 50 |

Inter, 59px main title, 38px right heading, 28px subtitle, 20px supporting copy,
navy backgrounds, warm-white card and teal accents follow the current context.
The industrial image keeps its #193951 field, 20% opacity, 21px rounded clipping,
117.63% image-box width, -6.69% left offset and 0.09% top offset. An explicit
`max-width:none` prevents the shared image rule from overriding the approved crop.
The text remains above the low-opacity image; image opacity was not increased.

Downloaded the current Figma PNG afresh into the existing local image path.
It is byte-for-byte identical to the bundled 1448 × 1086 image:
`8a4dfec9abb6d305897f2f93a28ac92a3ef155982e23a604003f11a6666555a2` (SHA-256).
Consequently there is no duplicate asset or allowlist/CSP change. Packaging still
checks the image against current source bytes.

## Responsive behavior and remaining visual differences

The desktop design adapts with smaller typography/padding; narrow windows stack
the hero and journey. Vertical scrolling is intentional on small windows. Tests
check horizontal overflow and copy bounds at 1280/1024/760/480px, followed by the
existing tests for all seven training stages. The top and lower 480px captures
show both hero text and the complete journey/action.

Figma's fixed text boxes become normal document flow so narrow text can wrap.
Browser/Windows font rasterization and fractional image-crop rounding can differ
by a few pixels from Figma's renderer; the inspected desktop layout closely matches
the current screenshot. No unrelated screen differences were adjusted.

## Verification

```powershell
npm.cmd test
npm.cmd run test:electron
npm.cmd run test:microphone
npm.cmd run dist:win -- --publish never
node test/validate-packaging.cjs
# Current welcome-only captures from the real Electron design runner:
$env:WAH_WELCOME_OUTPUT = Join-Path $PWD 'docs\final-welcome'
& .\node_modules\.bin\electron.cmd test/design-system-electron.cjs
Remove-Item Env:WAH_WELCOME_OUTPUT
# Run the same checks against the exact final archive:
$env:WAH_PACKAGED_APP = Join-Path $PWD 'dist\win-unpacked\resources\app.asar'
& .\node_modules\.bin\electron.cmd test/design-system-electron.cjs
Remove-Item Env:WAH_PACKAGED_APP
```

Local verification passed: **88 Node tests**, **170 Electron checks** (including
59 design checks), and **86 microphone checks**. Windows x64 NSIS built with
`--publish never`, using Electron 44.9.0. Archive validation passed, and **147
packaged checks** passed (27 smoke + 59 design + 31 modal + 30 PDF). These run the
real renderer against the final `app.asar` using the development Electron executable;
the NSIS installer itself was not installed. CI results are recorded in the draft PR.

Seven focused assertions were added to the
existing design runner: exact current wording, desktop geometry, effective image
crop/opacity, and four smaller-window copy/layout checks. Existing Begin Training,
session recovery, assessment, audio and PDF assertions are retained. Comparison
PNGs and this review folder are excluded from application packaging. No dependencies
were added or upgraded.

Physical microphones, live AI services, macOS packaging and installing the Windows
NSIS executable are not verified by these synthetic Windows regression checks.
