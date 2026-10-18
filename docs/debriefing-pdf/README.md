# Concise VR debriefing and PDF certificate

Based on main `d83eedc` (merged PR #9). This change preserves the seven stages,
question banks, scoring/readiness algorithms, certificate evidence requirements,
instructor identities/voices, microphone lifecycle and Worker endpoints.

## Why the opening was long

`startDebriefing()` concatenated the persona introduction, expertise label, entire
`vrSummary`, and a question. `addDebriefMsg()` sent that identical long text to TTS.
On summarization failure, `summarizeVrReport()` used the first 600 raw report
characters, so report text became narration without a meaningful sentence boundary.

## Separation of analysis, speech and context

- VR analysis still displays the detailed summary and existing imported-file and
  expertise information. Original imported text is retained in session state.
- One existing AI request generates the analysis. No extra takeaway request.
- `deriveVrTakeaway()` selects one complete 6–18-word observation only when it
  occurs in both the generated summary and imported report. It excludes questions,
  instruction-like language and classifications. This deliberately conservative
  check uses neutral wording for paraphrases it cannot ground locally.
- `debriefingOpening()` combines that optional observation with a brief
  acknowledgment and one reflective question: 41–59 words. It derives the optional
  takeaway again for older saved sessions; no new field is required to restore.
- Failed, empty or unsuitable summarization displays an explicit unavailable
  analysis message; it never turns a raw excerpt into speech.
- `buildDebriefingContext()` retains the full summary, progress, last eight
  messages and up to 12,000 report characters as explicitly untrusted context.
  The complete original report remains in state; this request bound does not
  delete it. Context is never passed directly to narration.
- Subsequent prompts target 25–60 words and one question. Unsuitable long, HTML,
  repeated-summary or multiple-question output is replaced with complete concise
  fallback sentences, rather than clipped. Fallbacks respond to the turn and may
  echo a short complete learner statement. AI completion/follow-up flags retain
  their existing semantics; the existing fourth-turn completion remains unchanged.
- Display and speech receive the same message. TTS/recording/device code is unchanged.

These checks bound repetition and common injection attempts; they cannot establish
semantic truth of arbitrary model output. Live AI quality remains a human-review item.

## PDF architecture and security

`src/certificate.js` builds one safe DOM template for both preview and print using
`textContent`. `src/certificate.css` shares typography, gold borders, navy/teal
hierarchy and spacing. No dynamic HTML or remote certificate assets are accepted.

`save-certificate` keeps the original sender and completion-evidence validation and
main-process readiness calculation. The native Save dialog offers PDF only. A
cancel returns before creating a print window and never marks a download. The
existing protected-path check now accepts an internal explicit `.pdf` expectation;
other reports still require `.docx`. No generic rendering/writing IPC was added.

`certificate-pdf.cjs` loads a trusted local certificate-only document in a hidden,
sandboxed window with no preload or privileged bridge, an independent in-memory
session, deny-by-default requests, restrictive CSP, denied permissions, navigation
and new-window restrictions. Only its exact HTML/JS/CSS/font can load. Chromium
`printToPDF()` generates A4 landscape locally with no headers/footers. Layout
overflow rejects the export. The window and session resources are cleaned up on
success and failure. Microsoft Word and external conversion services are unnecessary.

The original Inter font is retained. Contextual punctuation substitutions are
disabled only on the certificate because Skia otherwise maps some punctuation to
private-use Unicode when extracting PDF text. No replacement font/dependency is used.

The preview and PDF share identical text including the existing readiness
qualification. New completions record optional `debriefing.completedAt`; restores
preserve it and resets clear it. Older sessions lacking a historical date remain
eligible and display **Not recorded (legacy session)** rather than an invented
completion date. This is not an eligibility or scoring change.

## Figma and actual visual evidence

Source: [approved certificate frame 3:362](https://www.figma.com/design/V7F5upd1HOTEHGJgyo31qS?node-id=3-362).
Retrieved design context and its screenshot before implementation.

- [Detailed VR analysis](01-vr-analysis.png)
- [Concise debriefing and reflective question](02-concise-debriefing.png)
- [Actual certificate preview](03-certificate-preview.png)
- [Rendered first PDF page](04-exported-pdf.png)
- [Synthetic sample PDF](sample-certificate.pdf)
- Adversarial/layout samples: [200-character name](long-name.pdf),
  [international name](international.pdf), [HTML-like name rendered literally](hostile.pdf).

The approved Inter/navy/teal/gold, double border, title hierarchy, learner name,
completion statement, readiness and activity list are preserved. The PDF adapts
the card to landscape A4, removing application chrome/shadow. Necessary additions
are actual completion date and the original readiness qualification. The preview
and print share the template/text; print-specific page geometry has more whitespace.
No fabricated signature, accreditation, regulatory approval or certificate serial
is added. The existing misleading signature-style footer labels are replaced by
the honest WAH training-experience record identifier.

## Reproduce verification

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run test:electron
npm.cmd run test:microphone
npm.cmd run dist:win -- --publish never
node test/validate-packaging.cjs
$env:WAH_PACKAGED_APP = Join-Path $PWD 'dist\win-unpacked\resources\app.asar'
& .\node_modules\.bin\electron.cmd test/electron-smoke.cjs
& .\node_modules\.bin\electron.cmd test/pdf-certificate-electron.cjs
Remove-Item Env:WAH_PACKAGED_APP
# Optional synthetic review-artifact capture:
$env:WAH_PDF_OUTPUT = Join-Path $PWD 'docs\debriefing-pdf'
& .\node_modules\.bin\electron.cmd test/pdf-certificate-electron.cjs
Remove-Item Env:WAH_PDF_OUTPUT
# Optional independent text inspection, Python with pypdf:
python test/inspect-certificate-pdfs.py
```

`pdf-lib` is a development-only parser for PDF validity, pages and geometry; PDF
generation adds no production dependency. Independent `pypdf` inspection verifies
actual extracted Unicode text, learner identity, date, readiness and qualification.
Existing Word tests now exercise only Word exports; actual PDF generation and
malicious certificate text coverage run in Electron rather than pretending a PDF
is DOCX. Existing certificate evidence and adversarial IPC assertions are retained.
Review images/PDFs are excluded from application packaging.

## Verification results and limits

Local results: clean `npm ci` passed; **88 Node**, **163 Electron** and **86
microphone** checks passed. Windows x64 NSIS built with `--publish never` on
Electron 44.9.0. Archive validation checks exact certificate resources and excludes
the development PDF parser and synthetic review artifacts. Packaged smoke, design,
modal and PDF checks total **140 passed**. Independent pypdf inspection passed all
four sample PDFs. The dependency audit remains at **10 moderate** advisories.
CI results are recorded in the accompanying draft PR.
All test data is synthetic; external AI and native chooser responses are mocked.
Real Chromium produces the PDFs and the packaged archive is exercised separately.
Physical microphones, live services, macOS packaging and installation of the NSIS
installer are outside this Windows verification. International glyph coverage uses
local system fallback when Inter lacks a glyph; other operating systems need their
own font coverage checks. Poppler emits Skia Type 3 glyph bounding-box warnings,
but the inspected pages render cleanly and independent text extraction succeeds.
An initial concurrent audio/PDF run timed out detecting synthetic speech; the full
microphone suite passed serially without code/assertion changes.
