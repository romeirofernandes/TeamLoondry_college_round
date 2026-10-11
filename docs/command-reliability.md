# Command reliability fixes

The 2026-10-10 request covered cursor appearance, voice interpretation, media and tab actions, wake requests, permissions, comfortable calibration and configurable session controls.

Jev already selected from fixed actions. Missing media/boundary-scroll choices and an incomplete second command judgment caused valid paraphrases to become unknown. Live checks reproduced correct action selections rejected by the second judgment. Both judgments now describe the complete supported action set. Jev can also select actual tab titles and bounded page labels without inventing arguments. Exact local commands continue to bypass network delays. Unsupported speech remains a no-op.

Groq sometimes returns a supported simple action as a string instead of an object. That exact whitelist shorthand is reconstructed into an intent; unsupported strings and malformed arguments remain rejected. The prompt also demonstrates the expected object format. The "hey handsfree" prefix accepts punctuation and spacing variants. It is required at the start of each arbitrary request in the same final transcript. A standalone wake phrase does not authorize the next sentence, and unrecognized ordinary speech never falls back to Groq arbitrary commands.

The cloud speech fallback previously began recording after sound was detected and rejected short utterances. It now keeps a local recording ready before speech, discards silent chunks, accepts a short utterance and queues at most two completed uploads in order. Only final transcripts act. Browser/vendor and Groq audio processing remain disclosed; local-only speech never switches to cloud.

Media controls inspect video and audio elements inside permitted frames and open shadow roots, then act in the frame with the largest visible player. They do not depend on snapping. Finite videos seek within duration; live streams seek only within their available range. This is separate from browser back/forward and session pause.

Explicit coordinate clicks hit-test the cursor position, including open shadow roots and accessible same-origin frames, while retaining stale-tracking and sensitive-field guards. Named finds still act on the reviewed target. Cross-origin player controls use the media route; arbitrary coordinate clicking inside cross-origin frames and browser-protected controls remains limited by browser boundaries and synthetic-event restrictions.

Permission setup reads actual Chrome grants, reverts denied checkbox changes, and observes external grant/revocation events. Device switches display permission states; Chrome owns device revocation. Dashboard switches also needed their Radix `data-state` CSS corrected. Page/tab grants are polled and refreshed when returning from setup. Pause blocks page actions and dictation while listening for configurable resume phrases. Stop releases capture.

Calibration now has five guided captures and independent directional measurements. See [the calibration explanation](calibration.md). Cursor styles share fixed SVG shapes between preview and overlay and use a common hit point and thinner dwell ring.

## Verification

- Regression tests reproduced fresh-tab phrasing, split wake requests, custom pause/resume, unsnapped clicks, missing media commands and short-utterance capture before the fixes.
- Unit/integration checks cover denied/granted/revoked permission displays, paused speech routing, finite provider choices, safe Groq shorthand, five separate calibration poses and invalid/stale tracking.
- Real packaged-extension Chromium tests exercise cross-origin iframe play/pause/seeking, coordinate clicks, tab switching, dictation and submission confirmation, protected fields, capture lifecycle and dashboard authorization.
- Live Jev accepted requests for a clean browser tab, bringing Inbox to the front, pausing a film and reaching the page bottom. Ordinary conversation remained unknown. Live Groq returned a validated media pause and a fixture-page summary. Provider keys were read from ignored local configuration without being printed or changed.
- Connected dashboard checks cover settings persistence, permission truth, visible switch state changes, calibration thumbnail display, exclusion of photos from persisted state, and reflow at 320, 390, 768 and 1280 pixels.
- Final verification passed 224 unit/integration tests and 17 packaged browser tests. Both packages typecheck and build. Physical face/hand comfort, real microphone accuracy, actual YouTube playback and screen-reader announcements still require testing with the user's devices. The iframe playback test uses a deterministic local player, not a live YouTube session. Automated axe coverage was unavailable in this installation.

| Area | Before | After | User impact |
| --- | --- | --- | --- |
| State visibility | Switch styles used attributes Radix never emits | Checked state moves the thumb and changes the track | Grant and preference changes are visible, with text labels alongside |
| Cursor alignment | Arrow glyph and hit point differed | Arrow tip shares the cursor hit point | Spoken coordinate clicks match the visible aim |
| Calibration guidance | Undirected sweep without individual captures | Five named poses with progress and local photos | Users can follow and review each comfortable pose |

Reload `extension/dist` in chrome://extensions, then refresh controlled pages and the dashboard. Recalibrate Face and Hand separately. No environment files were changed and no deployment or push was performed.

## Tab controls, revised 11 October 2026

Closing the current tab now acts immediately. Form submission and site-specific mutations still require their existing confirmations. New tabs omit the URL so Chrome opens its normal New Tab page. Say `open a new tab with phones under 30k` to open those search results, or say `search for phones under 30k` after opening a tab. Active and background searches stay in the controlled window.

Explicit tab commands run locally before site navigation rules, including switching by number or title. Plain site phrases such as `switch to walking` on Maps and `go to five seconds` in a player retain their site meanings. Next and previous tab commands skip Handsfree controls. A tab operation waiting for Chrome is cancelled when the target or session changes.
