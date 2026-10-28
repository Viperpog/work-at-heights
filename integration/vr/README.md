# SafeHeight VR bridge — contract (phase 1)

WAH and the SafeHeight VR (Meta Quest 3, Unreal Engine 5.7) exchange **two JSON messages per VR session**:

| Direction | Message | Schema | Purpose |
| --- | --- | --- | --- |
| WAH → VR | `wah.session_plan` 1.0 | [`schemas/session-plan.schema.json`](schemas/session-plan.schema.json) | Learner levels from SmartChats, interview and quiz; the VR picks the weather scenario preset from it |
| VR → WAH | `safeheight.vr_event_log` 1.5 | [`schemas/vr-event-log.schema.json`](schemas/vr-event-log.schema.json) | What the learner did in the storm, plus the scenario actually applied |

This replaces the "you may now experience the VR" message and the manual `.docx` import in step 5. Phase 1 adds the contract only: the app does not use it yet.

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
- **One plan per session.** The VR consumes the plan at START and discards it when it writes the report, including partial ones (`HeadsetRemoved`, `OperatorReset`), so the next participant never inherits it.
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

## Running the simulators

```bash
npm run vr:mock-wah -- --plan integration/vr/examples/session-plan.study.json --out out/vr-reports
npm run vr:mock-vr
```

- `mock-wah`: `--plan <file>` (default `session-plan.training-basic.json`), `--port <n>` (default 8787), `--out <dir>` to save reports, `--drop-first-ack` to cut the connection before the first ack and exercise the VR's resend.
- `mock-vr`: `--url <ws url>` (default `ws://127.0.0.1:8787/ws`), `--report <file>` as the base report (default the real Quest run below).
- A real headset against `mock-wah`: `adb reverse tcp:8787 tcp:8787`, then start the VR bridge build.

`ws` is a devDependency for the simulators; it moves to `dependencies` when the server enters the main process (phase 3).

## Examples

| File | Provenance |
| --- | --- |
| `session-plan.training-basic.json`, `session-plan.study.json` | Written for the contract. |
| `vr-event-log.1.4.safe.quest.json` | Real 1.4 report, Quest 3 test run on 2026-10-11 (safe decisions). |
| `vr-event-log.1.4.partial-headset-removed.json` | Real 1.4 partial report, PC run on 2026-10-11 (headset removed in the welcome step). |
| `vr-event-log.1.5.training-basic.safe.json` | The Quest run above, upgraded to 1.5 under the training/basic plan by `upgradeReport()` in `mock-vr.cjs`. |
| `vr-event-log.1.5.study.partially-safe.json` | Real 1.2 PC run on 2026-10-10 (answered "stop and wait", then went down in the rain), brought to 1.4 and upgraded to 1.5 under the study plan. |

Reports carry no personal data: the session id is random and there is no name, e-mail or device serial.
