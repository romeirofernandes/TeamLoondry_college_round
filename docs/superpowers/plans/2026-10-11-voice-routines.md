# Voice Routines Implementation Plan

## Goal

Implement the approved record → review/name in dashboard → run voice routines flow without changing pointer, gesture, or calibration behavior.

## Implementation steps

1. **Shared contract and parser**
   - Define bounded routine definitions, semantic steps, recording/playback session status, and dashboard messages in `extension/src/shared.ts`.
   - Parse recording controls, routine playback controls, routine listing, and “run [name]” deterministically in `extension/src/core/parser.ts`.
   - Keep literal routine parameters local; never persist arbitrary transcript text.
2. **Background coordinator**
   - Validate and store at most 20 routines with 20 steps each in local storage; keep active draft and paused playback state in session storage.
   - Intercept routine commands before site/LLM routing.
   - Capture only eligible, successful voice actions; do not capture pointer/gesture actions, unsafe operations, ambiguous targets, or routine playback.
   - Replay sequentially through existing action handlers, pausing when a step cannot be verified. Restore playback paused after worker restart.
   - Expose a minimal dashboard message API for draft review, save, discard, list, and delete.
3. **Dashboard experience**
   - Add a Routines view with recording status, draft naming, ordered step review, remove/reorder, save/discard, and saved routine list/delete.
   - Render routine controls through the existing bridge and show clear action feedback.
4. **Self-review and verification**
   - Review the diff for allowlist enforcement, bounded persistence, safe restart behavior, and absence of gesture/pointer changes.
   - Run extension and dashboard typecheck/build commands only; do not push. Leave manual browser qualification and push approval to the user.

## Constraints

- Inline implementation only; no subagents.
- No tests are added or run.
- Keep all changes local for user review; do not push.
- The existing unrelated untracked file `docs/superpowers/plans/2026-10-11-native-form-filling.md` must remain untouched.
