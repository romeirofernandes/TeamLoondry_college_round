# Implementation review

Reviewed the extension against `spec.md` and implementation standards after the first implementation commit, `b509c4b`. Separate reviewers checked code and spec coverage. Review fixes have regression coverage.

## Code review

| Finding                                                                                               | Fix and verification                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stop during asynchronous startup could still acquire a camera or start recognition.                   | Generation and desired-session checks cancel stale startup. Browser tests defer settings, camera, and speech initialization and exercise stop, pause, and resume.                   |
| Local notices could hide a pending close confirmation.                                                | Session feedback and local notices have separate status regions. Browser coverage verifies the confirmation remains visible.                                                        |
| Page-find labels could contain editable text.                                                         | Label extraction excludes input/textarea/contenteditable text, including editable descendants and referenced labels. DOM tests verify only static labels enter target descriptions. |
| Pause followed by resume while local speech availability was pending could leave recognition stopped. | Deferred speech restart runs after startup settles and checks the session generation. A browser regression verifies one recognizer starts.                                          |

## Spec review

| Finding                                                                                | Fix and verification                                                                                                                                                |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent transcripts could route navigation while dictation was starting.            | The queue resolves dictation state when executing each transcript. Tests cover navigation and confirmation words becoming literal text.                             |
| Queued commands or delayed find results could act after pause or against another page. | Page revisions invalidate queued actions and provider results. Tests cover pause/resume and target changes.                                                         |
| Hand steadiness and selection each applied a dwell timer.                              | Tracking reports steadiness; the activation gate owns the only timer. An integration test checks activation at 800 ms and no repeat while held.                     |
| Hidden or covered elements could become snapped targets.                               | Ancestor visibility checks and hit testing reject hidden and occluded candidates. Offscreen targets remain available to explicit find. DOM tests cover these cases. |
| Changing pointer mode could briefly resume a paused tracker during model loading.      | Pause is restored immediately during restart. A lifecycle test verifies calibration and inference stay stopped until explicit resume.                               |

## Verified and pending

The full extension TypeScript check, 104 unit/DOM/lifecycle tests, production build, and 12 Chromium browser tests pass. The Next.js TypeScript check and production build pass. Extension dependency audit reports zero vulnerabilities.

An Axe WCAG A/AA audit reports zero violations for the popup and control window in both themes. Both screens have no horizontal overflow at 320, 390, 480, and 1280 px. Screenshots were inspected against the existing landing theme.

Browser tests load the packaged MediaPipe workers and models with fake camera frames. Pointer/transcript messages exercise real extension action handling, and mocked provider responses exercise page-find validation. These checks do not establish human tracking accuracy, microphone recognition accuracy, or a successful paid provider call.

Real-laptop evaluation remains necessary for lighting, noise, posture adaptation, under-30-second setup, and comparison with mouse/keyboard input. Use [the evaluation checklist](testing.md). Scope conflicts and Chrome compatibility limits are in [the spec review](spec-review.md).
