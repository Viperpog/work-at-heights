# Adaptive interview corrective feedback

Base: `main` at `84d2d3c`, including merged PR #6. Branch:
`codex/interview-corrective-feedback`.

## Current-answer contract

`evaluateWithApi()` still evaluates through the existing service and normalizes
the same score, correctness, isCorrect and recommendation fields. Explicit skips
still bypass AI, score zero and advance using the existing rule. A service/JSON
failure uses the existing local fallback only when configured; otherwise the
question/answer remains available for retry, without credit or advancement.

The shared `withInterviewFeedback()` evaluation step constructs one learner-facing
message for remote, fallback and skip results. It uses exact
`expectedAnswerPoints` from `data/question-bank.json`, with reviewed editorial
clauses keyed by exact bank text. It does not render raw AI teaching prose or
`nextInterviewerMessage`: that prose cannot be trusted to avoid invented facts or
future instructions. Remote prompts also specify the same concise, current-answer
contract. The remote score/criteria remain independent of this presentation step.
No second AI call or changed provider/Worker contract is required.

For an incorrect answer or skip, the message covers the expected concepts and
their safety connection in 2–3 explanatory sentences, plus a short acknowledgment
for uncertainty. Current-bank messages measure **43–65 words** across all four
personas and difficulties. They retain every missing point and qualifier, including
work suspension, equipment restoration exceptions and rescue capability. There
is no runtime word/character truncation and no padding to meet a target.

Partial feedback acknowledges a clearly demonstrated point once and teaches the
remaining points. Demonstration matching is deliberately conservative: exact bank
phrases or all significant bank words and numerical values, rejecting negation
except an exact bank statement. This matcher affects teaching only; it never
changes the existing permissive local keyword scoring. A learner's valid paraphrase
may therefore be explained again rather than falsely credited in the prose. If
all points are named but the evaluator still classifies the answer as partial,
the feedback asks for clarity of application without inventing missing facts.
Correct answers receive brief persona-sensitive reinforcement, not a lecture.

`makeSegue()` introduces only the **actual selected** next question: continue in
the same module or move to the actual next module. It no longer adds a second
correction or promises a retry, foundational review or related next question.
`handleAnswer()` displays one feedback bubble and one separate transition/question
bubble, then sends that same combined text to the existing speech path once.
Only the existing whitespace and `Module N:` speech normalization differs.

## Representative conversations

### Skip, Carlos, Module 1 Expert (`M1-E-01`)

Before: skip feedback requested chapter review without teaching the answer, then
the transition said, “Mira, that answer is not tight enough yet. We are stepping
back to rebuild the foundation before you move on,” immediately before announcing
Module 2.

After, for **I Don't Know**:

> Thanks for saying so. Mira, here are the essentials: NR-35 applies above 2.0 meters where there is a risk of falling; the work needs planning, organization and execution. Protection covers workers directly and indirectly involved; weather belongs in risk assessment as an external influence. These points connect planning and changing conditions to protection from falls.

Then the application separately announces:

> Now let's move to Module 2: Roles, Responsibilities, and Authorization.

The actual selected Module 2 Basic bank question follows. No repeat is promised.

### Incorrect, Module 5 Expert (`M5-E-01`)

Before: a local correction listed only the first three expected points, omitting
the suspension and no-invented-weather-limits points.

After:

> Mira, here are the essentials: Risk Assessment must consider adverse weather; external influences can change site conditions; restrictive conditions can prevent starting or continuing work. Suspend work if an unforeseen hazard cannot be eliminated or neutralized; do not infer wind or rain limits from NR-35 alone. Changing conditions can make starting or continuing work unsafe.

### Partial, Module 2 Expert (`M2-E-01`)

Learner: “organization implements preventive measures and risk assessment.”

Before: the generic local list repeated that same point and omitted another point.

After:

> You identified that the organization implements preventive measures and risk assessment. The important additions are: Workers follow NR-35 and employer procedures; an authorized worker is trained, clinically fit and approved. The organization suspends unforeseen hazardous work. This connects safe work to authorization, procedures and preventive measures.

### Correct

Carlos example: “Exacto. You identified the safety requirements clearly.”
The application continues in the actual module/difficulty chosen by the existing
algorithm. Persona openings, instructor selection and voice configuration remain.

## Integrity and evidence

Question/quiz banks, local hit calculation and thresholds, remote score
normalization and scoring instructions, `advanceInterview()`, classifications,
certificate rules, security/CSP/IPC and audio functions are unchanged. Existing
evaluation field names remain compatible; new report evidence uses the coherent
acknowledgment/explanation rather than an additional generic review instruction.
Chapter recommendations remain available in reports. Historical sessions/evidence
are not rewritten or rescored.

Verification commands:

```powershell
Set-Location 'D:\200 - WorkingatHeights\work-at-heights'
npm ci
npm test
npm run test:electron
npm run test:microphone
```

The new 10 Node tests cover all 240 questions, all personas/difficulties,
35–65-word bounds for current incorrect/skip feedback, preserved critical
qualifiers, partial acknowledgments, correct reinforcement, malicious/malformed
remote prose, missing bank evidence and the previous local scoring/progression
calculation. The new 19 real-Electron checks exercise skip/incorrect/partial/correct,
offline/malformed fallback, actual module transitions, one feedback bubble,
text-to-TTS agreement and disabled-fallback retry. AI responses and audio playback
are controlled doubles. Existing audio/microphone and certificate/security tests
remain in the complete suite.

Local Windows results: `npm ci` passed after closing the local WAH window locking
Electron DLLs; dependencies/lockfile are unchanged (10 existing moderate advisories).
`npm test`: **68 passed, 0 failed** (58 established + 10 new).
`npm run test:electron`: **45 passed, 0 failed** (22 smoke + 4 audio/runtime +
19 new feedback checks). `npm run test:microphone`: **9 Node + 21 diagnostic +
56 learner checks passed, 0 failed**. One initial microphone run timed out waiting
for synthetic signal during the voice-disable check; the unchanged suite passed
on rerun. No microphone test or audio implementation was changed for this task.

## Remaining review

- This is bank-grounded editorial/contract verification, **not** independent
  educational, regulatory or physical listening validation. An instructor should
  review the examples, safety meaning and spoken concision.
- The bank supplies the same four/five points for all 30 questions in each module,
  with no explicit priority/relevance annotations. All missing points are retained;
  the code does not invent question-specific distinctions or additional rules.
- If a future point is unknown, it is preserved as supplied without an invented
  safety connection. Empty evidence gets an explicit limitation message. Corpus
  tests require editorial review when bank content changes.
- Conservative partial matching cannot reliably understand arbitrary paraphrases,
  mixed correct/incorrect claims or subtle misconceptions. It avoids asserting
  understanding when uncertain; assessment criteria remain unchanged.
- The existing keyword scorer can produce questionable classifications. It was
  intentionally preserved and compared against its prior calculation, not repaired.
- No live AI/provider calls or physical headset checks were performed for this task.
  No Worker, credential, SmartChats, dependency-version or deployment changes.
