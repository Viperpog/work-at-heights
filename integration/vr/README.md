# SafeHeight VR bridge — contract (phase 1)

WAH and the SafeHeight VR (Meta Quest 3, Unreal Engine 5.7) exchange **two JSON messages per VR session**:

| Direction | Message | Schema | Purpose |
| --- | --- | --- | --- |
| WAH → VR | `wah.session_plan` 1.0 | [`schemas/session-plan.schema.json`](schemas/session-plan.schema.json) | Learner levels from SmartChats, interview and quiz; the VR picks the weather scenario preset from it |
| VR → WAH | `safeheight.vr_event_log` 1.5 | [`schemas/vr-event-log.schema.json`](schemas/vr-event-log.schema.json) | What the learner did in the storm, plus the scenario actually applied |

This replaces the "you may now experience the VR" message and the manual `.docx` import in step 5. Phase 1 added the contract; phase 2 (file exchange) stays as the fallback, see [Phase 2: exchange by file](#phase-2-exchange-by-file); phase 3 is the WebSocket server in the app, see [Phase 3: WebSocket](#phase-3-websocket).

## Files

| Path | What it is |
| --- | --- |
| `schemas/` | JSON Schema (2020-12) of the plan, the report and the WebSocket envelope. The specification. |
| `../../src/vr-contract.cjs` | Runtime gate with no dependencies, for the Electron main process: validation, envelope, `saidVsDid()`, `scenarioConfigFor()`. |
| `examples/` | Valid examples. See [provenance](#examples). |
| `mock-wah.cjs` | Simulated WAH server, for developing the VR without the desktop app. |
| `mock-vr.cjs` | Simulated VR client, for developing WAH without a headset. |
| `../../test/vr-contract.test.cjs` | Keeps schemas, validator and examples in agreement, and runs both simulators against each other. |

## Message flow

WAH serves `ws://127.0.0.1:8787/ws` on loopback only. With the Quest on USB, `adb reverse tcp:8787 tcp:8787` makes the headset's `127.0.0.1` reach the PC, so nothing is exposed on the network. The envelope is the one the VR's QuestSupervisor plugin already speaks (`version`, `id`, `type`, `topic`, `clientId`, `correlationId`, `requiresAck`, `payload`).

1. VR → `type: hello`, with `capabilities` including `wah.session_plan@1` and `safeheight.vr_event_log@1.5`.
2. WAH → `publish wah.session_plan` (`requiresAck: true`). Resent on every hello until acknowledged.
3. VR → `publish vr.plan_ack` (`correlationId` = the plan message id): `accepted` + `applied_config`, or `accepted: false` + `error`. A rejected plan runs the default scenario.
4. VR → `publish experience.lifecycle` (optional, existing topic).
5. VR → `publish safeheight.vr_event_log` (`requiresAck: true`). The VR always writes the file too, and resends the report after a reconnect until it is acknowledged.
6. WAH → `publish wah.report_ack` (`correlationId` = the report message id): `stored: true`, or `stored: false` + `error`. WAH de-duplicates by `session_id` and refuses a report that answers another plan.

Fallback without a network: the same plan goes to `Saved/Input/session_plan.json` on the headset (`adb push`) and the report comes back from `Saved/Reports/vr_report_latest.json` (`adb pull`).

## Rules

- **Versions.** Additive changes bump the minor version; renames or removals bump the major. Readers reject another major and ignore unknown fields. WAH accepts reports from 1.4 (current VR build) on.
- **One plan per session.** The VR consumes the plan at START and discards it when it writes the report, including partial ones (`HeadsetRemoved`, `OperatorReset`, `EarlyReturn`), so the next participant never inherits it.
- **Privacy.** The learner is a pseudonym (`^[A-Za-z0-9_-]{4,64}$`): never the name or e-mail. Validation errors name the field, never the received value.
- **Modes.** `study` pins every learner to the `intermediate` preset (the validated build) so behavior is comparable; the level is only recorded. `training` follows `vr.level`. `overrides` exist for testing and calibration and are reported in `scenario_config.overrides_applied`.
- **No hints.** Presets change the time to decide, how clear the signals are and the feedback after an error. Never a hint before the decision.

| Preset | `question_timeout_s` | `error_pause` | `lightning_before_question` |
| --- | --- | --- | --- |
| `basic` | 35 | true | true |
| `intermediate` (current build) | 25 | true | false |
| `expert` | 15 | false | false |

Initial proposal, to be calibrated in the pilot.

- **`weather.said_vs_did`** (1.5) compares the tablet answer with what the learner did after the foreman's radio call: `keep_inspecting` ↔ `continued_inspection` / `photographed_before_pressure`, `stop_and_wait` ↔ `stopped_and_waited`, `descend_now` ↔ `descended_during_rain`. `null` without a declared action (`no_answer`, storm not reached). Reference: `saidVsDid()`.

## Phase 2: exchange by file

1. **Plan.** When the quiz ends, the main process builds `wah.session_plan` 1.0 (`create-session-plan`): `mode: "study"`, `vr.level` = quiz level, `weak_topics` = `state.quiz.recommendations`, `pseudonym` = `L-` + 8 hex of SHA-256 over the lower-cased e-mail (stable; the e-mail never leaves the main process). Step 5 has **Save VR Session Plan**, which writes `session_plan.json` (`save-session-plan`); the operator copies it with `adb push` to `Saved/Input/session_plan.json`.
2. **Report.** Step 5 accepts `.json` besides `.docx` (`select-vr-report`). The main process validates it with `vr-contract.cjs` (256 KB limit), refuses a 1.5 report that answers another `plan_id` or has no plan, and refuses a `session_id` already imported. 1.4 reports carry no plan, so they are accepted *unbound* (`bound: false`). The renderer only sends the current `plan_id` and the imported `session_id`s.
3. **Level by rule** (`vrLevelFor`, first row that matches wins; no regex, no model; `learner_profile.level` is never read because in study mode it differs from the applied preset):

| # | Condition | Result |
| --- | --- | --- |
| 1 | invalid, other plan, repeated `session_id` | rejected |
| 2 | `completed=false`, `end_reason≠Results` or `verdict=incomplete` | no level; asks for a new VR session; step 5 stays open |
| 3 | `unsafe`, `critical_risk`, `final_decision=continued_inspection_in_rain` or `director.critical_failures≥2` | Basic |
| 4 | `partially_safe`, descent during rain or premature, `critical_failures≥1`, `said_vs_did=inconsistent` (1.4: `saidVsDid()`), `stopped_after_intervention`, `time_up` or `scenario_config.preset=basic` | Intermediate (ceiling) |
| 5 | `safe` + `safe_decisions` + 0 failures + `said_vs_did≠inconsistent` + `ppe.all_correct` + `lifeline.connected_before_ascent` | Expert |
| 6 | anything else | Intermediate |

4. **Readiness.** A VR session without a level is stored as `Not rated` and leaves the average (it used to count as 1 point and made Expert unreachable). Average of the rated items: ≥ 2.75 Expert, ≥ 1.75 Intermediate, else Basic (same cut-offs as 11 and 7 out of 12 points). The certificate shows "Not rated".
5. **Debriefing and summary.** For JSON, the model receives a digest of validated enum/number fields (`reportDigest`), never the raw JSON or free text from the device, and is told it must not assign a level.

**Pending decisions**
- The certificate is still issued when the VR is not rated or `vr_validity=inconclusive` (phase 4). Decide whether to block it.
- An incomplete JSON session leaves step 5 open; the only way past it without a new session is the `.docx` fallback.
- 1.4 reports are accepted without plan binding. Reject them once the bridge build (1.5) is the only one in use.

## Phase 3: WebSocket

`src/vr-bridge.cjs` runs the server of the [message flow](#message-flow) in the Electron main process. The screen still has `connect-src 'none'`: it talks to the main process over IPC only.

1. **Connect Quest** (step 5) builds the plan if needed (`ensureVrPlan`), hands it to the main process with the session ids already imported (`vr-bridge-connect`), starts the server on `127.0.0.1:8787/ws` (only on this first click) and runs `adb devices` + `adb -s <serial> reverse tcp:8787 tcp:8787`. adb is looked up in `WAH_ADB`, `ADB`, `ANDROID_HOME`/`ANDROID_SDK_ROOT`/`%LOCALAPPDATA%\Android\Sdk` `platform-tools`, then `PATH`. Missing adb, no headset or an unauthorized headset each give their own message; the server keeps running (adb can be run by hand) and the file buttons still work.
2. **Plan.** Sent on every `hello` until a `vr.plan_ack` answers one of the copies sent (`correlationId`) for the same `plan_id`; a plan set while the headset is already connected goes out at once, and a new plan (retake, another learner) replaces the old one. A bound report also counts as delivery (the ack may have been lost). An incomplete session (rule 2) puts the same plan back out for the next session.
3. **Report.** The envelope and the report are validated by `parseMessage`; the plan and duplicate checks are the same as the file import (`judgeVrLog`). Accepted: stored in memory, `wah.report_ack stored:true`. Repeated `session_id` (a resend after a lost ack, or a report already imported by file): `stored:true` again, kept once. Another plan, no plan, or invalid: `stored:false` + `error` (field path only), nothing kept.
4. **Screen.** The main process sends `vr-bridge-event` notices (`status`, or `report` = something is waiting); the screen pulls the results with `vr-bridge-take-reports` (same shape as a JSON file import, plus `source: 'websocket'` and `planId`) once the learner has a plan, skips a result bound to a plan it no longer holds, and imports it with the same rule table. Step 5 shows connection, plan and last report status.

`test/vr-websocket.test.cjs` runs `mock-vr.cjs` against the real server: full cycle, plan resent per hello, connection cut before the plan ack and before the report ack (through a proxy), duplicates, other plan, invalid report, incomplete session, port in use, adb messages, and the IPC path of the main process.

**Pending for the headset test:** the real `adb reverse` with the Quest 3 on USB; the VR bridge build's reconnect timing; and whether `hzdb`'s own adb conflicts with the one WAH finds (if so, point `WAH_ADB` to the same adb).

## Phase 4: presence, probe and post-test

Order for the learner: quiz → **weather check (before)** → VR → **presence questionnaire** → debriefing → **review quiz** → **weather check (after)** → certificate.

1. **Weather check before the VR** (step 5). `data/climate-probe.json`: a fixed module 5 probe in two parallel forms, A and B (item *n* of both tests the same chapter with another situation). Counterbalanced by the plan's pseudonym: even last hex digit → A before / B after, odd → B before / A after. No feedback. Connect Quest, Save VR Session Plan and Upload stay locked until it is answered. The items stay away from what the VR measures (stop and wait × descend × keep inspecting, the foreman's pressure), so the probe is never a hint before the decision.
2. **Presence** (step 5, right after a report is imported, JSON or Word): Slater-Usoh-Steed (SUS), 6 items on a 1–7 scale, worded for the work site. Stored: answers, mean, count of 6–7 answers (Slater's original score). **Mean < 4 → `vr_validity = inconclusive`**; the VR level is never changed. Continue to Debriefing waits for the questionnaire. A new VR session asks again.
3. **Debriefing.** A JSON report gives the model the structured fields of the 1.5 report (`debriefFacts`: `said_vs_did`, declared decision, behavior after the call, final decision, classification, failures, PPE, lifeline, `scenario_config`), plus validity and SUS mean, and **no report text**. The opening states said × did with fixed phrases (no model). The Word fallback keeps its text as before.
4. **Review quiz (post-test)** (step 7, after the debriefing). One question per chapter, at most 6: chapters from the VR events first (`reviewChaptersFor`), then the quiz recommendations; none of the quiz's own questions; intermediate when available. No chapters → 5.2 and 5.6. Correct answers and explanations after submitting.

| VR event | Chapters |
| --- | --- |
| kept inspecting / photographing in the rain | 5.6, 5.7 |
| descent in the rain or premature | 5.7, 5.5 |
| `said_vs_did = inconsistent` | 5.12 |
| safety supervisor intervention | 5.9 |
| `verdict = time_up` | 5.3 |
| critical failure | 5.7 |
| PPE not all correct | 6.7 |
| lifeline not connected before the ascent | 7.6 |

5. **Weather check after** (step 7, the other form), then the certificate. The PDF and the screen show `Weather check (module 5): before VR x/5 · after review y/5`; the main process recomputes it (and the SUS) from the answers, never from the screen's numbers. The debriefing report also lists validity and the weather check. Sessions that never took the check before the VR are not blocked.

`src/post-assessment.cjs` (main) and the "Phase 4" block of `renderer.js` share the rules; `test/post-assessment.test.cjs` keeps them in agreement.

**To calibrate with the professor**
- SUS cut-off (mean < 4, the scale midpoint) and the item wording for the work site; or another instrument (IPQ).
- The probe items, the equivalence of forms A and B, and whether 5 items are enough.
- The event → chapter map and the 6-question limit of the review quiz.
- The certificate is still issued with `vr_validity = inconclusive` (same pending decision as "Not rated").
- Answering the presence questionnaire after a restart: if the app closes between the report and the questionnaire, the session resumes at step 6 with the debriefing locked; the learner goes back to step 5 to answer it.

## Running the simulators

```bash
npm run vr:mock-wah -- --plan integration/vr/examples/session-plan.study.json --out out/vr-reports
npm run vr:mock-vr
```

- `mock-wah`: `--plan <file>` (default `session-plan.training-basic.json`), `--port <n>` (default 8787), `--out <dir>` to save reports, `--drop-first-ack` to cut the connection before the first ack and exercise the VR's resend.
- `mock-vr`: `--url <ws url>` (default `ws://127.0.0.1:8787/ws`), `--report <file>` as the base report (default the real Quest run below).
- A real headset against `mock-wah`: `adb reverse tcp:8787 tcp:8787`, then start the VR bridge build.

- The app itself against `mock-vr`: start WAH, reach step 5, press **Connect Quest** (the adb message is expected without a headset), then `npm run vr:mock-vr`.

`ws` is in `dependencies` since phase 3 (the server runs in the main process).

## Examples

| File | Provenance |
| --- | --- |
| `session-plan.training-basic.json`, `session-plan.study.json` | Written for the contract. |
| `vr-event-log.1.4.safe.quest.json` | Real 1.4 report, Quest 3 test run on 2026-10-11 (safe decisions). |
| `vr-event-log.1.4.partial-headset-removed.json` | Real 1.4 partial report, PC run on 2026-10-11 (headset removed in the welcome step). |
| `vr-event-log.1.5.training-basic.safe.json` | The Quest run above, upgraded to 1.5 under the training/basic plan by `upgradeReport()` in `mock-vr.cjs`. |
| `vr-event-log.1.5.study.partially-safe.json` | Real 1.2 PC run on 2026-10-10 (answered "stop and wait", then went down in the rain), brought to 1.4 and upgraded to 1.5 under the study plan. |

Reports carry no personal data: the session id is random and there is no name, e-mail or device serial.
