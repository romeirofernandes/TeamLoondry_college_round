# Testing

## Automated checks

Run the extension's typecheck, Vitest tests, build, and Playwright tests. Build downloads checksum-verified model assets once and packages all runtime vision assets locally.

Unit/DOM coverage includes exact parser matching and unknown phrases, target-latched dwell, pause/loss/low confidence, hand hold and release, edge scrolling, tab wrap/ranking/ties, local log retention and summaries, typed insertion, command isolation during dictation, sensitive field rejection, expiry/changed-target form confirmation, local-speech mode behavior, stale recognition results, and tracking lifecycle/calibration.

Browser tests load the real built scripts in Chromium. The isolated fixture manifest pregrants tabs and localhost access so native permission dialogs do not block automation; the distributed manifest retains optional permissions. Deterministic pointer/transcript messages exercise the same runtime protocol as real tracking/recognition. Fake camera frames test stream release and local model initialization. They do not measure real user performance.

### Dashboard and transcript integration

Run `HANDSFREE_DASHBOARD_ORIGIN=http://localhost:3001 node tests/dashboard-next.mjs` from `extension/` with the Next server running on that origin. Set `CHROMIUM_PATH` to an installed Chrome for Testing executable when `/usr/bin/chromium` is unavailable. If installed, `@axe-core/playwright` adds light/dark accessibility checks. The harness verifies actual permission states, switch thumb changes, local calibration thumbnails excluded from persisted state, connected command scrolling, pause/resume/stop, saved cursor choices across reload, expanded slider bounds and saved values, and responsive widths 320, 390, 768 and 1280. Screenshots and JSON reports are written to ignored `extension/test-results/`.

The Chrome suite mirrors final speech callbacks using `TRANSCRIPT` plus `HEARD`, verifies interim text cannot activate, and exercises named click ambiguity, search query/background preservation, tab switching, wake answers, find-only highlights and wake-prefixed named clicks with submit confirmation. Only the provider HTTP boundary is replaced with deterministic fixtures in wake browser tests; routing, local page matching and confirmation gates are real. This proves integration, not live speech recognition or provider accuracy. YouTube-style visible `aria-hidden` thumbnails are eligible for pointer targeting and share dwell with their same-link title; `aria-hidden` page text remains excluded from provider context. Cursor DOM coverage checks that style changes preserve an active dwell timer and its one-click latch. Legacy settings coverage uses a stored fixture genuinely missing the new fields.

After each rebuild, reload the unpacked extension in `chrome://extensions` and refresh the webpage/dashboard. Never copy local provider keys into test output or tracked files.

## Tracking regression measurements

Run `node tests/tracking-timing.mjs` from `extension/` to check raw-frame capture while the displayed video clock is deliberately frozen. `--baseline=50fa96b` runs the previous tracker against the same harness. On this machine the previous tracker dropped from about20updates/second to0; the updated tracker maintained about20updates/second. This reproduces a frame-delivery failure, not every cause of lag on a physical laptop.

The long-page pointer harness measured a95thpercentile update around0.3ms on20,000controls after visible-target indexing, compared with about20ms in the imported diagnosis. Chrome browser checks also verify fresh worker inference after the popup closes and the browsing tab navigates.

## Laptop checklist

Use the fixture from the root README. Start the Next.js site and open its dashboard from the popup. Return to the fixture to test control; closing the popup should leave capture running.

| Check                                      | Expected result                                              | Record                                                      |
| ------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------- |
| First setup with permissions               | Plain permission text, live preview, visible errors          | Seconds from opening popup to first successful selection |
| Neutral and range calibration              | Five separate captures complete in 15 seconds; no selections during calibration | Total setup time, comfortable range, retries                |
| Face point to five targets                 | Small held turns keep moving; neutral stops in place             | Correct selections, missed targets, sensitivity             |
| Broad hand control                         | Complete open palm stays visible; small movement and steady hold work             | Correct/incorrect selections, fatigue                       |
| Brief passes over targets                  | No click before dwell threshold                              | Accidental activations                                      |
| Leave halfway through dwell                | Ring resets and no click                                     | Cancellation result                                         |
| Stay after a selection                     | No repeated click until leaving and returning                | Click counter                                               |
| Cover camera, move out of view, disconnect | Cursor freezes; no dwell or hand action                      | Loss count and any accidental action                        |
| Resume after loss                          | Stable position, target review before action                 | Jumps, wrong selection                                      |
| Shift posture slowly                       | Review comfort; recalibrate if neutral needs correction                  | Recalibration count                                         |
| Dim light/backlight                        | Low reliability blocks selection, feedback remains clear     | Correct selections and observed failures                    |
| Selected-language voice commands                   | Exact intended actions; unknown phrase does nothing          | Intended command, heard phrase, action                      |
| Fans/music/distant microphone              | Failures show feedback without unrelated actions             | Accuracy at each noise condition                            |
| Dictate navigation words                   | Words insert; no navigation                                  | Text match and input events                                 |
| Change focus during dictation              | Typing stops                                                 | Any text in wrong field                                     |
| Password/payment field                     | Dictation refused                                            | Any insertion                                               |
| Submit then wait/cancel/change target      | No submit without bound, timely confirmation                 | Submission counter                                          |
| Close tab then cancel/switch tab           | Original close is cancelled                                  | Any tab closed unexpectedly                                 |
| Duplicate tab titles/find labels           | Numbered choice required                                     | Wrong match/activation                                      |
| Say hey handsfree to find offscreen target                      | Scroll/highlight; no click                                   | Match result                                                |
| Wake named click and page/general question | Click/open matches real labels with confirmation gates; answers are text | Match errors, answer usefulness, privacy exclusions |
| Scroll speed and cursor preferences | Save across reload; ring visible for all styles; scroll stops on pause/loss as appropriate | Speed comfort, dwell visibility |
| Find with missing key/invalid key/no match | Clear error/no-op                                            | Any unintended action                                       |
| Pause during pointing/dictation            | All page actions and dictation stop; only session controls are accepted                          | Any action after pause                                      |
| Close popup and return to webpage           | Capture and pointer updates continue                         | Fresh inference after closing preview                       |
| Stop session                               | Camera indicator and recognizer end                          | Capture stopped                                             |
| Export then clear log                      | JSON exported; clearing removes retained events              | Local storage result                                        |

Use non-sensitive sample forms. Browser compatibility limits described in README apply.

## Measure the problem statement's outcomes

For each task, mark task start, perform a defined task, then mark task complete. Record selection errors and accidental activations using the annotation buttons. Export each run before clearing the log.

A task might be: open a link, find an offscreen target, enter a sentence, submit with confirmation, switch to a named tab, and close that tab with confirmation.

Report:

- Task completion time for successful attempts, plus failures and retries.
- Command accuracy as intended commands correctly recognized and executed divided by attempted commands. Parser-recognized counts alone are insufficient.
- Selection errors as incorrect targets selected divided by selection attempts.
- Accidental activation count and rate per minute.
- Setup time, frame rate, inference latency, tracking losses, and recalibration count.

For the original problem statement's mouse/keyboard baseline, repeat the same tasks manually with conventional input and record times/errors in a separate worksheet. Alternate input order and use comparable page state. This is an evaluation procedure, not a built-in side-by-side mode, which spec.md excludes.

Real device results are not available from this automated coding environment. Fill the checklist before claiming the under30secondsetup target or robustness to lighting, posture, and noise is met.
