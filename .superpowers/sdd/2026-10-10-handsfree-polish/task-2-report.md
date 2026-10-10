# Task 2 implementation report

Implemented comfortable face rate control, stable thumbnail/title snapping, smooth scrolling, and control-setting persistence validation. Task 1 parser/router/provider behavior is retained; `ActivationGate` is unchanged.

## Root causes

- Face and hand used the same absolute mapping to viewport center. Holding an offset reached a fixed position, and returning to neutral recentered the pointer. Calibration continued updating this hidden position while selection confidence was zero.
- Edge scrolling invoked the command-scroll helper: an instantaneous 65%-viewport jump every 700 ms, after the 900 ms edge hold.
- Snapping preferred each anchor independently. YouTube thumbnail and title anchors could reset the dwell target even with identical destinations. Thumbnail wrappers were not resolved to actual descendant links; an occluded thumbnail could redirect to a nearby exposed title.
- Settings loaded without validation, and save validation retained the old sensitivity/dwell maxima. New scroll/cursor fields had no defaults or validation.

## Changes

- Face offsets now produce filtered velocities and elapsed-time displacement. A held small turn continues moving; neutral stops immediately at the current position. Elapsed time is capped at 100 ms and reset on loss/pause/reacquisition. Hand remains absolute with its original default mapping and steadiness behavior.
- Face rate control has a 12% minimum neutral band to avoid cumulative landmark-noise drift. Face calibration accepts reliable ranges down to 0.008, rejects movement overwhelmed by measured neutral noise, and expands the calibrated range enough to contain measured noise in that band. Hand saved-calibration validation retains its previous minimum. Face/hand storage keys remain separate.
- Calibration freezes hidden cursor movement. Face instructions request small comfortable turns without stretching; hand instructions request palm movement while keeping it framed.
- Thumbnail wrappers resolve only usable actual descendant anchors under the pointer. Equal-href links in the same semantic card retain the previously visible usable link as target; unrelated channel links/buttons stay distinct. Covered controls block fallback to nearby titles, including before the intersection index delivers initial entries. Existing dwell timing and rearm/latch logic are unchanged.
- Voice scroll animates in bounded frame increments over approximately 420 ms, with configurable distance. Reduced-motion preference performs the bounded command immediately. Voice works without calibration/confident samples and continues through camera loss; pause/stop/navigation cancel it. An explicit command takes priority over held-edge movement.
- Edge scroll retains the 900 ms initial hold, then integrates per-frame velocity rather than repeating page jumps. It stops on loss, stale samples, pause/stop, or leaving the edge. Both scroll paths find the nearest scrollable ancestor and pass remaining distance to its parent at boundaries.
- `scrollSensitivity` defaults to 1 and validates 0.2–3. `cursorStyle` defaults to circle and validates circle/arrow/crosshair/spark for Task 3. Pointer sensitivity validates 0.2–6; dwell validates 400–5000 ms with the original 800 ms default. Startup and saves share control normalization, including nonfinite values and invalid old booleans/enums.

## RED/GREEN evidence

All feature changes followed failing regression assertions before implementation.

| Focused command (from extension/) | RED evidence | GREEN evidence |
| --- | --- | --- |
| `npm test -- tests/tracking.test.ts tests/tracker-lifecycle.test.ts` | 3 expected failures: held turn stopped at a fixed absolute position, reacquisition never continued displacement, calibration secretly moved x/y. | Initial implementation: 16/16 passed. |
| `npm test -- tests/content.test.ts` | 3 expected thumbnail failures: wrapper returned null, title changed identity, covered thumbnail snapped to exposed title. | 28/28 passed. |
| `npm test -- tests/content.test.ts` | 5 expected scroll failures: edge jumped 499.2 px, voice moved immediately, sensitivity ignored, pause could not cancel, nested container was ignored. | Content and settings implementation: content/background 76/76 passed. |
| `npm test -- tests/background.test.ts` | 3 expected failures: invalid saved controls remained invalid; sensitivity/dwell clamped at 3/2500; invalid new fields remained unchanged. | Background settings regressions passed. |
| Tracking/lifecycle focused command | 2 expected noise failures: tiny neutral offset drifted, noise-dominated calibration saved successfully. | 18/18 passed. |
| Content focused command after controller clarified voice independence | 1 expected failure: camera loss canceled an intentional voice animation. | Regression passed after removing that dependency. |
| Content focused command for explicit voice priority | 1 expected failure: held bottom edge canceled upward voice animation and kept scrolling down. | Regression passed with bounded voice priority. |
| Content focused command with an undelivered intersection index | 1 expected failure: covered thumbnail still redirected to title. | 36/36 passed after browser hit-stack obstruction check. |
| `npm test -- tests/tracker-lifecycle.test.ts` | 1 expected failure: lowering face calibration acceptance accidentally accepted a tiny saved hand range. | 10/10 passed after mode-specific saved-calibration validation. |

Two test-run issues were corrected during iteration: the very first npm command used the worktree root (no package.json), then was rerun from extension/; one intentionally failing intersection-index test initially left its observer alive on failure, producing a jsdom teardown warning, so test cleanup was moved before the assertion. Neither remains in final verification.

## Final verification

Fresh final output on 2026-10-10 after all production edits:

```text
> handsfree-extension@0.1.0 test
> vitest run
Test Files  9 passed (9)
Tests       203 passed (203)
Exit code   0

> handsfree-extension@0.1.0 typecheck
> tsc --noEmit
Exit code   0

 git diff --check
Exit code   0; no output
```

Self-review checked the task brief, global constraints, mode-specific calibration acceptance, timing reset, voice independence, edge cancellation, target identity/occlusion, default dwell preservation, and Task 1 shared-file preservation. No keys were printed or tracked; no push or deployment occurred.

## Remaining concerns

- Physical camera ergonomics and live YouTube behavior have not been claimed from synthetic tests. Calibration/neutral-noise behavior is tested with synthetic landmark samples; a user camera comfort check remains useful.
- This task defines cursor styles/settings; Task 3 must render them and expose the controls in the dashboard.
- Browser integration/build validation belongs to the controller's integration pass; this task ran the complete extension unit suite and TypeScript checks requested by its brief.
