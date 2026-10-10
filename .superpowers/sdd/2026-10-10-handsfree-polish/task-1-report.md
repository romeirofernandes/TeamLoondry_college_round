# Task 1 report: reliable final speech actions and Groq assistance

Status: DONE_WITH_CONCERNS (live Jev paraphrase conservatively rejected; deterministic local commands and Groq assistance verified).

## Scope and constraints

Work completed only in `/Users/gavinsoares/Projects/TeamLoondry_college_round/.worktrees/handsfree-polish`. Read the Task 1 brief and spec Global Constraints, without reading the whole plan. Applied systematic debugging, test-driven development and verification before completion. No subagents, push or deployment. No physical microphone/camera accuracy claim. Read ignored provider config only for harmless live requests; no credentials were printed or placed in tracked files. Only the first four configured Groq keys are available to reservation/storage/status; the fifth is excluded.

## Root causes and data flow

1. `offscreen.ts` sends `TRANSCRIPT(final:true)` and `HEARD` only from the final-recognition callback, while interim callbacks send only `TRANSCRIPT(final:false)`. The background `TRANSCRIPT` path is display-only. Final `HEARD` reaches `parseIntent`, then the serialized command router, `action`, and content `PAGE_ACTION` execution.
2. `providers.mapCommand` parsed exact commands but, when Jev was configured, bypassed Jev only for emergency commands. Even exact scroll/click/tab/search commands could become unknown on conservative provider classification or fail outright on a rejected network request. Parsed search arguments could also include spoken placement suffixes.
3. `routeHeard` serialized every command behind slow provider work, with immediate interruption only for pause/stop. An explicit click therefore waited for a remote request unrelated to that click. Cancelling work needed both an abort signal and checks against page/session revisions, because transports can finish after cancellation.
4. The protocol had no local named-click command, public page context or answer message. Groq only returned IDs/intents, so a valid textual answer was silently discarded.
5. Review reproduced two additional races: a direct dashboard start-typing action could leave an earlier provider click live, and a provider tab action could continue after pause if a tab-permission await completed later. Literal ranking initially checked only the first substring occurrence; a later whole-word occurrence needed to outrank a substring-only label.

## Implementation

- `parseIntent(text): Intent` remains intact. Added anchored polite scroll, click/open label, next/previous/named-tab variants and prefix/suffix background search/new-tab parsing. Unknown/quoted speech stays non-command; only exact stop-typing exits dictation.
- All recognized local parser results bypass Jev. `find` remains reserved for the existing explicit arbitrary route. Jev remains available for unknown command paraphrases with the existing confidence/directness checks and finite action union.
- Added local `click-target`. Content scans usable public targets, excludes protected/private targets, and ranks literal accessible labels by exact, whole-word, then substring match. Query text is never compiled as a regex. Duplicate best matches use existing numbered choices; a unique result activates through the same voice/submit confirmation path as current-target click.
- Added cancellable provider work. Explicit click/open/named-click and pause/stop/cancel can interrupt an active provider operation. Pending start/stop-typing transcripts block interruption to preserve dictation order. An urgent-command barrier keeps subsequent queued speech behind the interrupting action. Queue cancellation does not rely on the transport honoring abort.
- Abort/revision checks suppress stale IDs, answers and actions after interruption, pause, stop, target changes, navigation or target removal. Direct control actions abort pending provider work. Provider tab actions check cancellation again after permission/tab reads before mutation.
- Added `GET_PAGE_CONTEXT`, `PageContext` and `ANSWER`. Context includes title (500 chars), URL (2000 chars) and at most 12000 chars of public document text. It excludes inputs, editable regions including plaintext-only, hidden/inert/aria-hidden/CSS-hidden text, sensitive containers, scripts/styles/templates, marked private content and extension UI.
- Groq receives optional context plus bounded targets, and can return exactly one of a validated allowed action, supplied target IDs, or nonempty text answer of at most 6000 chars. Mixed/malformed results and invented IDs fail validation. General questions work with empty/unavailable target scans and absent context.
- Answers pass through existing `textContent` feedback rendering and dashboard feedback, never HTML. Overlay feedback preserves line breaks and bounds its height. Page-action/find-result/answer transport errors surface in feedback.

## Changed files

- `extension/src/core/parser.ts`: anchored local command parsing.
- `extension/src/providers.ts`: local priority, four-key reservation, context/answer validation and prompt.
- `extension/src/background.ts`: cancellable routing, typing barriers, stale-action checks, safe context/answer forwarding and four-key provider storage/status.
- `extension/src/shared.ts`: named target, page context and answer protocol.
- `extension/src/content/dom.ts`: safe public text and literal target ranking.
- `extension/src/content/runtime.ts`: local named activation and context/answer handling.
- `extension/src/content/overlay.ts`: bounded multiline feedback display.
- `extension/tests/core.test.ts`, `providers.test.ts`, `background.test.ts`, `content.test.ts`: parser, provider, real router and DOM regressions.

## RED/GREEN evidence

Baseline before implementation:

```text
npm test --prefix extension
Test Files 9 passed (9)
Tests 138 passed (138)
```

Added regressions before production edits:

```text
npm test --prefix extension -- --reporter=dot
Test Files 4 failed | 5 passed (9)
Tests 28 failed | 140 passed (168)
```

Expected failures included offline exact scroll/click/tab commands, corrupted search query placement, click blocked behind a pending Groq request, missing wake answer, missing local named activation/ambiguity, unavailable safe context, answer markup rendering, and malformed answer combinations being accepted.

First GREEN followed implementation and updating two prior expectations for intentional behavior changes (search now stays local; key rotation now uses four keys): 168/168 tests, typecheck exit 0.

Additional cancellation review:

```text
npm test --prefix extension -- tests/background.test.ts --reporter=dot
RED: Tests 2 failed | 30 passed (32)
GREEN: Tests 32 passed (32)
```

Failures were named `cancels pending provider actions when controls enter dictation directly` and `rechecks cancellation after tab permission resolves`; neither was a fixture/type error.

Additional literal ranking review:

```text
npm test --prefix extension -- tests/content.test.ts --reporter=dot
RED: Tests 1 failed | 24 passed (25)
GREEN: Tests 25 passed (25)
```

Failure was `recognizes a later whole-word occurrence ahead of a substring-only label`; the implementation returned an ambiguity instead of activating the whole-word result.

Final fresh checks before commit:

```text
npm test --prefix extension
Test Files 9 passed (9)
Tests 176 passed (176)
Duration 1.15s

npm run typecheck --prefix extension
tsc --noEmit
exit 0

git diff --check
exit 0
```

Tests cover provider-unavailable exact commands, pending provider then click, stale action/answer cancellation, numbered duplicate labels, regex-literal names, whole-word rank ordering, search/background tab arguments, local tab switching, wake answers despite failed targets, context privacy/12000-character bound, malformed/combined/oversized provider answers, markup as literal text, no interim activation, typing isolation/order, existing submit/close confirmation gates and dispatch errors. All original test files pass; no omitted baseline failures.

## Harmless live checks

Used an in-memory esbuild bundle of the real provider module and ignored local config; no tracked artifact included credentials. Requests had empty targets and no user page content.

- Groq `qwen/qwen3.8-27b`: `What is 2 plus 2?` returned validated `{ ids: [], answer: '4' }`.
- Jev through OpenRouter: `a little lower please` completed and the conservative mapper returned `{ type: 'unknown', heard: 'a little lower please' }`.

## Concerns and limits

- The live Jev paraphrase did not clear existing conservative mapping thresholds. No thresholds were relaxed. Exact supported scroll/click/tab/search commands now execute locally regardless of that provider result; unknown paraphrases can still be rejected safely. Groq general-answer availability was verified live.
- Per the brief and controller confirmation, immediate provider interruption is limited to click/open/named-click and emergencies. Other local commands perform no provider request of their own but keep existing speech ordering behind already-pending provider work, preserving queued-close and dictation safety.
- Context/DOM and router behavior are automated fixture checks. Browser end-to-end and physical tracking/microphone evaluation belong to later tasks and were not claimed here.

## Review fix round 1 (base e3dcff2)

Read the Important finding in `task-1-review.md`. Reproduced the remaining stale browser mutations before editing production code: `activateTab` lost the provider predicate across `tabs.get`, and incognito authorization used the result after cancellation. Provider tab choices also omitted the predicate when activating their selected tab.

Changes are confined to background routing and its tests:

- Next/previous/named-tab and tab-choice paths now pass the validity predicate to `activateTab`.
- `activateTab` snapshots the page revision and checks it together with provider validity after `tabs.get`, after tab activation, and after window focus, before issuing the next mutation.
- In-progress controlled activations carry a token so Chrome's own `onActivated` echo does not advance the revision or abort the very switch that generated it. The helper commits `target` once, and after that deliberate transition uses the expected new revision before publishing completion. Late echo events for the current target are also ignored. Tokens are removed in `finally`, including cancellation/error paths.
- Incognito authorization now rechecks validity after its asynchronous read and before creating a window or publishing a denial.
- Corrected the browser test double's `tabs.update` parameter types so the transition-event regression uses the real call signature.

RED/GREEN evidence:

```text
npm test --prefix extension -- tests/background.test.ts --reporter=dot
Initial RED: Tests 4 failed | 33 passed (37)
Expanded RED: Tests 5 failed | 34 passed (39)
GREEN: Test Files 1 passed (1); Tests 39 passed (39)
```

Expected RED failures showed tabs activating after delayed reads despite pause/cancel/stop, incognito opening after a superseding click, and window focus occurring after pause while the tab update was outstanding. A positive transition regression confirms that a still-valid provider switch completes when Chrome emits its own activation event.

Full verification after the production fix:

```text
npm test --prefix extension
Test Files 9 passed (9)
Tests 182 passed (182)
Duration 1.06s

npm run typecheck --prefix extension
Initial check: TS2345/TS7006 in the new test override because the original tabs.update double inferred a zero-argument signature.
Corrected the double's parameter types; reran npm run typecheck --prefix extension:
tsc --noEmit
exit 0

git diff --check
exit 0
```

No production changes followed the full suite; the subsequent change only typed the existing test double's unused parameters. Self-review confirmed the fix carries validity through every reviewed helper call, permits its own target revision change, and leaves direct dashboard tab activation available when the voice session is stopped. No new live provider requests, credentials, push, deployment or physical performance claims. Previous live Jev paraphrase concern remains unchanged.

## Packaged-browser command fixture correction (after 43738e8)

The controller reported a packaged-browser failure in `dictation words do not navigate; submission requires confirmation`: after submit and confirm, the fixture submission counter stayed zero. Rebuilt the extension from current TypeScript before diagnosis. The case initially passed alone (1/1, 507 ms) and with the preceding click case (2/2), indicating a timing-dependent interaction. A full run passed dictation but failed the later resume-click case and timed out while setting up the final dashboard authorization case (7/9 passed). A second full run with temporary command diagnostics reproduced both command failures while both dashboard tests passed (7/9 passed); no authentication change was made.

Diagnostic evidence from the real background session and content feedback:

```text
start typing: confidence 1; dictation on
scroll down: confidence 1; dictation on
hello world: confidence 1; dictation on
stop typing: confidence 0; Dictation stopped.
submit form: confidence 0; Tracking is uncertain. Move back into view before activating a target.
confirm: confidence 0; Nothing is waiting for confirmation.
```

Root cause: deterministic command tests injected one confident pointer sample while the real offscreen tracker simultaneously processed Chrome's blank fake-camera stream. Blank-camera inference correctly emitted confidence zero and could replace the test sample before submit/confirm or the resumed click. Production low/stale tracking and confirmation gates behaved correctly.

Test-only correction in `extension/tests/extension.spec.ts`:

- `point()` pauses offscreen inference directly before injecting deterministic pointer input. It does not pause the background session or change any production state/safety code. Each test's existing START setup starts capture afresh; the capture lifecycle and packaged-worker tests continue to exercise real inference.
- The dictation scenario injects a fresh pointer sample before submit and before confirm, matching the required fresh tracking signal rather than relying on an earlier sample staying valid.
- Removed all temporary diagnostics. No production gates were relaxed and no implementation change was needed for form submission.

Verification after the fixture correction:

```text
npm run build --prefix extension
Local model assets ready; background/content/tracking/UI/offscreen bundles built; exit 0.

# Cached Chrome for Testing executable supplied via CHROMIUM_PATH;
# NO_COLOR and FORCE_COLOR unset to remove harness conflicts.
npm run test:e2e --prefix extension -- --grep 'actual content|dictation words|low confidence'
3 passed (4.7s)

npm run test:e2e --prefix extension
9 passed (12.1s)
```

The full browser run passed actual content clicks, dictation and submit confirmation, low-confidence/pause/escape behavior, missing-key/unknown no-ops, named tab switching and close confirmation, live offscreen capture through popup close/navigation, dashboard key/privacy boundaries, dashboard authorization after in-place navigation, and packaged face/hand blank-frame rejection.

```text
npm test --prefix extension
Test Files 9 passed (9)
Tests 182 passed (182)
Duration 1.91s

npm run typecheck --prefix extension
tsc --noEmit
exit 0

git diff --check
exit 0
```

Remaining limitation: these browser checks use fake camera/microphone inputs and injected pointer samples. They make no physical accuracy or comfort claim. The prior live Jev paraphrase concern remains unchanged. The single dashboard setup timeout observed before the fixture correction did not recur in either subsequent complete run; all authorization assertions passed in the final run.

## Review fix round 2 (base 8e11cc7)

Read the new Important finding in `task-1-rereview.md`. Reproduced the exact A-to-B race: B's controlled activation echo is emitted, window focus remains deferred, the user activates original tab A, then focus resolves. The previous current-target shortcut ignored A, leaving the provider valid and incorrectly committing B.

Narrow correction in `background.ts`: an expected activation whose ID is in `tabActivations` remains suppressed. A current-target activation is ignored only when no controlled transition is active. If the user returns to the current target while a different controlled activation is pending, `target(tabId)` immediately aborts provider work and advances the page revision before any asynchronous browser reads. The stale helper therefore fails validity when focus resolves and cannot commit B. Late echoes of an already-committed current target remain harmless. Production tracking and confirmation gates are unchanged.

Added a focused regression that emits B's own echo, defers window focus, emits user A activation, then resolves focus. It asserts that A remains the target, no successful-switch feedback is published, and no page state is dispatched to B. The previous positive own-echo regression remains in the same focused suite.

RED/GREEN and final verification:

```text
npm test --prefix extension -- tests/background.test.ts --reporter=dot
RED: Test Files 1 failed (1); Tests 1 failed | 39 passed (40)
Failure: expected targetTabId 1, received 2 after focus resolved.
GREEN: Test Files 1 passed (1); Tests 40 passed (40)

npm test --prefix extension
Test Files 9 passed (9)
Tests 183 passed (183)
Duration 1.26s

npm run typecheck --prefix extension
tsc --noEmit
exit 0

git diff --check
exit 0
```

Self-review confirmed `target` aborts/invalidates synchronously before its first await, only the expected controlled-tab echo is suppressed during an in-progress switch, and valid self-generated transitions still complete. Changes are limited to `extension/src/background.ts`, `extension/tests/background.test.ts` and this report. No new browser/live-provider runs were needed for this narrow unit-reproduced event race; the previous 9/9 browser evidence belongs to 8e11cc7. Existing live Jev paraphrase limitation remains unchanged.
