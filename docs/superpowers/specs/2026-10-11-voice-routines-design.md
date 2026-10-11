# Voice Routines

## Goal

Let a Handsfree user record a repeatable browser task using ordinary voice commands, review and name the draft in the dashboard, then replay it later by name.

This is a new extension and dashboard feature. It must work with the existing voice command path and must not change head movement, hand gestures, pointer activation, or site-adapter behavior.

## Approved user flow

1. The user says **“Start recording a routine.”**
2. The user performs a task with supported voice commands. Handsfree records a step only after the command succeeds and confirms the captured step.
3. The user can say **“Undo last routine step”**, **“Pause routine recording”**, or **“Resume routine recording.”**
4. **“Stop recording routine”** ends capture and creates a draft. It does not save or run the draft.
5. The dashboard displays the draft as an ordered list. The user names it, removes or reorders steps, and saves it.
6. The user later says **“Run [routine name].”** Handsfree runs the steps in order and pauses with a clear message if a step fails or needs a choice.

## Design decision

Record successful semantic Handsfree commands, not screen coordinates, raw pointer paths, or arbitrary browser events. A step stores a normalized, allowlisted intent and only the parameters required to repeat it. At playback, Handsfree resolves page targets afresh and uses the existing page/tab action paths. A stale element ID or old page snapshot is never replayed.

This keeps routines usable when layouts move and lets existing safety checks continue to guard navigation, tab changes, and page actions. The recorder observes voice-issued commands only; head/hand pointer activations and gesture presets are not silently added.

## Commands

### Recording

- “Start recording a routine” / “Record a routine”
- “Pause routine recording”
- “Resume routine recording”
- “Undo last routine step”
- “Stop recording routine”

### Listing and playback

- “List my routines”
- “Run [routine name]”
- “Pause routine”
- “Resume routine”
- “Stop routine”

Routine controls are deterministic commands and do not go to an LLM. “Stop routine” cancels the current playback; it does not close tabs or undo completed actions.

## Initial step catalog

The first version records only successful, repeatable, low-risk actions already supported by Handsfree:

- Open a supported website.
- Search for a phrase, preserving active/background-tab behavior.
- Switch to a named or numbered tab, where tab access is available.
- Open a uniquely matched visible link or target by its spoken label.
- Scroll up/down/top/bottom.
- Use supported media playback controls.
- Navigate back or forward.

The capture boundary is an explicit allowlist. Unknown commands, provider interpretations, partial transcripts, failed commands, clicks based only on a transient pointer location, file uploads, form fills/dictation/submission, account changes, sending/publishing, purchases, and destructive actions are not recorded in v1. Unsupported commands still work as normal Handsfree commands; they simply do not become routine steps.

Search phrases and named target queries are shown in the local draft because they are needed to repeat the task. Routine data stays in Chrome local storage on the device and is never sent to providers, telemetry, or a sync service.

## Draft and dashboard behavior

- The extension background worker owns the active recording draft and playback state so capture can continue while the user changes tabs or returns to the dashboard.
- An unfinished draft may be held in Chrome session storage so a worker restart does not silently lose the in-progress recording. It is not treated as a saved routine.
- The dashboard has a Routines section with the active recording indicator, step count, ordered draft review, name field, remove/reorder controls, save/discard actions, and a saved-routines list.
- The dashboard shows each step in plain language. It does not expose raw transcript history.
- Saved routines use a stable ID, case-insensitively unique user-provided name, ordered step list, and created/updated timestamps. Editing and deleting are dashboard actions.
- Enforce bounded local storage (proposed initial limit: 20 saved routines, at most 20 steps each). Reject excess or malformed data with a useful message rather than truncating silently.

## Capture and playback lifecycle

- Start/stop recording commands are handled before normal action routing. They are never captured as steps.
- A step is appended only after the action path reports success. Failed, ambiguous, stale, cancelled, or unsupported actions are not appended.
- Each new step is announced as a concise summary, such as “Step 3 recorded: Search for jazz in a new tab.” The user can immediately undo it.
- Pausing capture keeps the draft; stopping capture freezes it for dashboard review. Discarding a draft explicitly removes it.
- Playback is sequential. Each step is re-resolved against the current browser state; navigation steps wait for the destination state before the next step.
- If a step cannot be uniquely grounded or verified, playback pauses and reports the step number and next action. It does not guess or continue past a failed step.
- A tab change expected from the current routine step is allowed. An unrelated target-tab change, user pause/stop/cancellation, or extension shutdown cancels playback. Completed steps are not reversed.
- Playback progress is session-local. If the service worker restarts, playback is restored paused and requires an explicit resume; the in-flight step is never automatically replayed.
- Playback actions are tagged as routine-originated so the recorder cannot record its own replay.
- Re-running a routine requires a fresh voice command each time. No scheduled, background, or automatic replay is included.

## Safety, privacy, and compatibility

- Existing site adapters retain priority for site-specific workflows. Routine capture must not bypass their guards.
- Each replayed action uses the same permissions and checks as the corresponding normal voice command.
- Steps that would write account state, send content, submit a form, purchase, delete, or otherwise create an external consequence are excluded from v1. They are not made safe merely by being inside a routine.
- No form values, dictation, passwords, payment data, sensitive fields, raw transcripts, or page text are stored in routines.
- Routine step parameters are local-only and must not be included in diagnostics, metrics, provider requests, or session transcript persistence.
- The feature does not change gesture recognition, camera access, pointer calibration, or dwell activation.

## Integration points

- Add typed routine definitions and voice-command intents in extension/src/shared.ts.
- Parse routine control phrases deterministically in extension/src/core/parser.ts.
- Keep saved routines and the bounded recording/playback session in the extension service worker using extension storage.
- Add a recorder/playback coordinator that wraps existing command execution and records only successful allowlisted voice actions.
- Add dashboard messages to the extension bridge allowlist and implement the Routines section in next/components/dashboard/.
- Preserve action ownership: supported site adapters execute their own commands; routine orchestration does not directly manipulate site DOM.

## Failure behavior

- If recording starts while another draft is active, ask whether to discard it or return to it; never silently overwrite.
- If no eligible commands succeed during capture, keep the draft empty and explain that there is nothing to save.
- If the dashboard disconnects, the draft remains in the active extension session and can be reviewed after reconnecting.
- If a saved routine is malformed or contains an unsupported step after an upgrade, stop before that step and explain that the routine needs editing.
- A playback failure offers Resume, Stop, or a fresh normal voice command. It never repeats the last action automatically.

## Acceptance criteria

1. A user can start, pause, resume, undo, and stop recording with voice without affecting face/hand control behavior.
2. Only successful allowlisted voice actions are appended; failed, ambiguous, unsafe, and pointer-only actions are omitted.
3. Stopping capture creates a reviewable dashboard draft and never saves it automatically.
4. The user can name, reorder, remove, save, discard, list, and delete routines from the dashboard.
5. A saved routine can be invoked by name and executes its current steps sequentially using fresh page/tab state.
6. A failed or ambiguous step pauses playback with an actionable explanation; later steps do not run.
7. Routine playback cannot recursively record itself and does not bypass site-adapter or existing command protections.
8. Routines are local-only; excluded values and transcript content do not appear in persistent routines or telemetry.
9. Routine storage and drafts have explicit size limits and recoverable invalid-data behavior.
10. Extension typecheck/build pass, and manual qualification covers recording, undo, dashboard review, save/reload, playback, failure pause, cancellation, privacy, and gestures/head-control coexistence.

## Out of scope

- Recording mouse/face/hand coordinates or arbitrary DOM events.
- Batch form filling, free-form dictation, sensitive data, or automatic submission.
- Automatic/scheduled routines, cloud sync, routine sharing/import, or LLM-generated workflows.
- Site-specific routines that bypass adapters or permissions.
