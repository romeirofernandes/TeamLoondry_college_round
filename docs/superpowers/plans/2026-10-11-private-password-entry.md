# Private Password Entry Implementation Plan

> Execute directly with superpowers:executing-plans. User explicitly prohibits subagents and requests work on main. Keep product changes local for approval.

**Goal:** Silent password entry through the existing head/hand pointer and optional native Chrome-popup control.
**Architecture:** A page-local keyboard binds one password field. A persistent worker privacy latch gates speech and providers before enabling keys. The native companion has an explicit speech-disabled credential session with camera ownership handoff.
**Tech Stack:** TypeScript, MV3, Vitest/Playwright, React/Tauri/Rust.
**Spec:** ../specs/2026-10-11-private-password-entry-design.md

## Global constraints

No secret in messages, metrics, routines, transcripts or providers. Keyboard never submits. Preserve ordinary gesture/head behavior. HTTPS or localhost; top-level password fields only. Privacy remains latched until explicit Resume voice. No push and no unrelated changes.

## Review focus

Stale field after navigation must reject edits; microphone startup races must invalidate capture; worker restoration must preserve privacy; held dwell must type once; native disconnect must stop capture.

### Task 1: Page-local keyboard

Files: extension/src/content/private-keyboard.ts; extension/tests/private-keyboard.test.ts.
Interface: PrivateKeyboard.open(field), ready(boolean), hit(x,y), activate(button), close(), valid(). Keys and password remain exclusively local.
- [x] Write and run failing DOM tests for masked edits, shifts, selection, Done/Close without submit, invalid binding and insecure origin.
- [x] Implement closed-shadow keyboard, exact field binding and native setter events with no data payload.
- [x] Run DOM tests to green.

### Task 2: Privacy lifecycle and runtime integration

Files: shared.ts, core/parser.ts, content/runtime.ts, background.ts, offscreen.ts, privacy tests.
Interface: PRIVATE_INPUT enter/resume; PRIVATE_POPUP start/return; PAGE_STATE.privateInput; OFFSCREEN_COMMAND private-enter/private-exit.
- [x] Add failing tests for microphone stop acknowledgement, speech/provider rejection, latch restoration and dwell.
- [x] Implement sticky session privacy, startup guards, cancellation, routine pause and page-local pointer keyboard routing.
- [x] Run extension tests/typecheck/build and packaged fixture checks.

### Task 3: Native popup handoff

Files: extension/src/desktop.ts; desktop/src/main.tsx; desktop/src-tauri/src/bridge.rs/lib.rs/speech.rs; native tests.
Interface: credentialControl, credentialStatus; credential_ready/credential_return; connection-bound lifecycle only.
- [x] Add failing lifecycle tests; implement capture transfer and speech prohibition.
- [x] Add Return/Stop UI and extension polling/reclaim with privacy still latched.
- [x] Run desktop unit/typecheck/native tests.

### Task 4: Review and user guide

- [x] Review all privacy/capture entry points; sentinel leak tests and regression suites.
- [x] Document commands, supported fields and native platform limits; record tested versus physical-device qualification.
- [x] Report local reviewable changes; do not push.

## Execution ledger

Ruling: User approved design and implementation; continue without another plan approval gate.
Ruling: Preserve existing local executor.ts WhatsApp change; no subagents or separate checkout.

Task 1: complete — closed-shadow keyboard, exact field binding, no submission, key and mutation tests.
Task 2: complete — persistent latch, acknowledged microphone stop including pending startup, privacy generations, provider/audio cancellation, routine pause, private pointer gate and restored normal controls.
Task 3: complete — native connection/token lifecycle, speech prohibition, camera handoff/return and compact UI fixture coverage.
Task 4: complete — inline review and guide in docs/private-password-entry.md. No feature push or subagents.

Ruling: Added worker/offscreen privacy session revisions after a regression reproduced an old Resume voice request unmuting a newer password focus. Old exits now fail closed.
Ruling: Disable auxiliary popup/dashboard previews and device permission checks during private entry to preserve capture ownership.
Ruling: Tests use controlled credentials and deterministic camera/native fixtures. Real autofill popup plus physical movement qualification is explicitly left for the target Mac, not represented as automated coverage.
Verification record: extension full unit suite, extension typecheck/build, packaged extension+private keyboard+routines Playwright suites; desktop unit/typecheck/build, 14 UI tests, 19 Rust tests; Next typecheck. Final counts recorded in final response after rerun.

Final local rerun: 2,956 extension unit tests, 24 packaged browser tests, 13 desktop unit tests, 14 desktop UI tests and 19 Rust tests passed. Extension/desktop/Next typechecks and extension/desktop builds passed. Installed the missing Playwright Chromium test runtime. One title-switch check timed out during the first browser run; it passed alone and in the complete 24-test rerun without a product-code change. Physical native autofill qualification remains outstanding. No push.
