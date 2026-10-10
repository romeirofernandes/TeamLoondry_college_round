# Testing

## Automated checks

Run the extension's typecheck, Vitest tests, build, and Playwright tests. Build downloads checksum-verified model assets once and packages all runtime vision assets locally.

Unit/DOM coverage includes exact parser matching and unknown phrases, target-latched dwell, pause/loss/low confidence, hand hold and release, edge scrolling, tab wrap/ranking/ties, local log retention and summaries, typed insertion, command isolation during dictation, sensitive field rejection, expiry/changed-target form confirmation, local-speech mode behavior, stale recognition results, and tracking lifecycle/calibration.

Browser tests load the real built scripts in Chromium. The isolated fixture manifest pregrants tabs and localhost access so native permission dialogs do not block automation; the distributed manifest retains optional permissions. Deterministic pointer/transcript messages exercise the same runtime protocol as real tracking/recognition. Fake camera frames test stream release and local model initialization. They do not measure real user performance.

## Laptop checklist

Use the fixture from the root README. Keep controls visible beside your browser.

| Check                                      | Expected result                                              | Record                                                      |
| ------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------- |
| First setup with permissions               | Plain permission text, live preview, visible errors          | Seconds from opening controls to first successful selection |
| Neutral and range calibration              | Completes in about8seconds; no selections during calibration | Total setup time, comfortable range, retries                |
| Face point to five targets                 | Smooth movement; only intended target highlights             | Correct selections, missed targets, sensitivity             |
| Broad hand control                         | Palm movement and steady hold work without pinch             | Correct/incorrect selections, fatigue                       |
| Brief passes over targets                  | No click before dwell threshold                              | Accidental activations                                      |
| Leave halfway through dwell                | Ring resets and no click                                     | Cancellation result                                         |
| Stay after a selection                     | No repeated click until leaving and returning                | Click counter                                               |
| Cover camera, move out of view, disconnect | Cursor freezes; no dwell or hand action                      | Loss count and any accidental action                        |
| Resume after loss                          | Stable position, target review before action                 | Jumps, wrong selection                                      |
| Shift posture slowly                       | Neutral adapts without constant calibration                  | Recalibration count                                         |
| Dim light/backlight                        | Low reliability blocks selection, feedback remains clear     | Correct selections and observed failures                    |
| Local voice command list                   | Exact intended actions; unknown phrase does nothing          | Intended command, heard phrase, action                      |
| Fans/music/distant microphone              | Failures show feedback without unrelated actions             | Accuracy at each noise condition                            |
| Dictate navigation words                   | Words insert; no navigation                                  | Text match and input events                                 |
| Change focus during dictation              | Typing stops                                                 | Any text in wrong field                                     |
| Password/payment field                     | Dictation refused                                            | Any insertion                                               |
| Submit then wait/cancel/change target      | No submit without bound, timely confirmation                 | Submission counter                                          |
| Close tab then cancel/switch tab           | Original close is cancelled                                  | Any tab closed unexpectedly                                 |
| Duplicate tab titles/find labels           | Numbered choice required                                     | Wrong match/activation                                      |
| Find offscreen target                      | Scroll/highlight; no click                                   | Match result                                                |
| Find with missing key/invalid key/no match | Clear error/no-op                                            | Any unintended action                                       |
| Pause during pointing/dictation            | All selection and recognition stops                          | Any action after pause                                      |
| Stop or close controls                     | Camera indicator and recognizer end                          | Capture stopped                                             |
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
