# Handsfree spec

## Problem statement

People with motor limits, injury, or strain cannot rely on mouse plus keyboard for everyday browsing. Head, hand, and voice input exist but they rarely combine into one safe flow that moves, selects, types, and manages tabs without misfires.

## Solution

Handsfree, a Chrome extension only with no backend and no OS control. It moves a snappy in page cursor with head as main pointer plus gross hand as second pointer, confirms with dwell plus voice, types by dictation with separate submit confirm, runs tab plus arbitrary find by voice with LLM only for arbitrary, and logs runs local only.

## User stories

1. As a user with limited hand control, I want to start Handsfree from the popup, so that browsing starts without touching input devices.
2. As a user, I want to calibrate neutral plus range in under 30 seconds, so that setup feels fast.
3. As a user, I want head motion to move the cursor with dead zone plus smoothing, so that small shakes do not move it.
4. As a user, I want posture drift to adapt slowly, so that I do not need constant recalibrate.
5. As a user, I want the cursor to freeze on tracking loss, so that it never jumps or clicks alone.
6. As a user, I want one click recalibrate plus sensitivity sliders, so that I can tune feel fast.
7. As a user with limited finger control, I want gross hand motion for point plus hold to confirm, so that pinch is never required.
8. As a user, I want low confidence to block dwell and hand confirm, so that unsure tracking does nothing.
9. As a user, I want the cursor to snap to links plus buttons plus inputs with outline plus label, so that targets are clear.
10. As a user, I want hover to highlight the snapped target, so that I know what dwell will hit.
11. As a user, I want dwell around 800 ms with visible ring plus cancel on leave, so that brief passes never fire.
12. As a user, I want to say click this or open this on the snapped target, so that voice plus cursor combine.
13. As a user, I want scroll by voice plus edge hold, so that I can read long pages.
14. As a user, I want fixed commands for scroll up, scroll down, go back, go forward, click this, open this, start typing, stop typing, so that core moves stay deterministic.
15. As a user, I want tab voice for new tab, background search, next tab, previous tab, close tab with confirm, go to named tab, open incognito, open history, open downloads, open settings, so that tab work stays handsfree.
16. As a user, I want arbitrary find like find careers page to scan live DOM even outside viewport, scroll plus highlight the match, ask on ties, do nothing on no match, so that it never guesses in silence.
17. As a user, I want unknown phrases to show what was heard with no action, so that errors are clear.
18. As a user, I want dictation that only inserts text and never fires commands, with clear on state, explicit stop, manual corrections for now, separate confirm for submit, so that typing stays safe.
19. As a user, I want wake plus form fill after core works with hey handsfree, LLM paired with page HTML to fill all fields in one pass, highlight for review, never auto submit, guard on password plus payment, so that forms stay reviewable.
20. As a user, I want instant pause that stops cursor plus voice plus dictation at once, so that I can stop everything fast.
21. As a user, I want camera plus mic prompts with plain why text plus live preview, tab access only when tab or find runs, settings in chrome storage local, voice only fallback on deny, so that onboarding is clear.
22. As a user, I want all tabs context for switching by title, so that voice can reach any open tab.
23. As a user, I want overlay that never blocks page clicks and ignores itself in hit test, so that pages stay usable.
24. As a user, I want protected pages to show a clear out of scope message, so that limits are known.
25. As a user, I want LLM only for arbitrary with text only sent, no frames or audio leaving the machine, missing key disables arbitrary with message, so that privacy holds.
26. As a user, I want MediaPipe Face plus Hand running local in a worker with measured fallback to main, fps plus latency logged, so that UI never freezes.
27. As a user, I want run logs local only with oldest first drop plus clear button, details open for now, no side by side mouse comparison, so that storage never fills.
28. As a user who is blind, I want read aloud parked for later with target plus feedback spoken on toggle, off by default, so that future support is planned.

## Implementation decisions

- Modules stay separate: tracking, speech adapter, intent parser, browser actions, safety, metrics, UI. Fewer seams, highest seam possible.
- Tracking seam: one cursor point source behind an interface, face leads, gross hand second, fused point plus confidence out, freeze on loss.
- Speech seam: one recognizer adapter behind an interface, Web Speech API for v1, text normalize plus alias match for fixed, LLM path only for arbitrary, dictation text never routes to commands.
- Intent seam: fixed parser deterministic, tab plus arbitrary behind same interface so new phrases add without rework, arbitrary rank by text plus accessible name.
- Browser seam: content script owns overlay plus snappy plus hit test plus dwell plus scroll plus focus plus insert, background service worker owns tab reads plus switches plus LLM fetch to keep page CORS clean, settings plus calibration in chrome storage local.
- Safety seam: one gate checks confidence plus dwell time plus pause state before any activate, sensitive submit needs separate confirm, close tab needs confirm.
- Snappy shape follows react grab primitives idea: point hit test with grabbable filter for links plus buttons plus inputs plus interactives, outline plus label, ignore flag on overlay subtree.
- Calibration rule: neutral plus range set once, dead zone middle, One Euro smoothing, slow drift adapt, one click recalibrate.
- Permission order: camera plus mic first with preview, tab read on first tab or find use, deny keeps voice only path.
- Privacy rule: frames plus audio local only, arbitrary sends link text plus phrase only.
- Glossary to carry forward: snapped target, dwell, arbitrary find, fixed command, tracking loss, all tabs context.
- ADRs to write during build: direct LLM from background with no backend, worker with measured fallback, gross hand with no pinch dependence.

## Testing decisions

- Good tests check outside behavior, not internals, through parser outputs, gate decisions, DOM effects.
- Cover parser plus dwell plus tab logic plus arbitrary rank with Vitest, overlay plus snappy plus dictation plus tab switch with Playwright on sample pages, manual on demo laptop for light plus distance plus noise plus loss plus accidental activation.
- Timing per your call: auto plus manual at the end, details up to me unless you step in.

## Out of scope

- OS cursor control outside Chrome, native companion app, backend or cloud store, offline speech promise, side by side mouse comparison, demo script which stays with you, metrics field freeze, read aloud build, wake word build.

## Further notes

- Keys live local only, arbitrary off without key with message.
- Tab close plus form submit always need confirm.
- Popup content locked for now with freedom to alter when needed: start plus stop, camera plus mic status plus preview, calibrate plus recalibrate, sensitivity plus dwell sliders, voice plus dictation status plus last heard, error text with fix hints.
