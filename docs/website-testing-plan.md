# Handsfree website testing plan

Prepared 2026-10-10. Planning document only. No live-site test execution or website adapter implementation is claimed.

The requested list contains 12 unique sites; Amazon and Meet were repeated. Two assignments below cover six sites each. These are workflow assignments, not an equal-effort estimate. Meet and IRCTC need extra investigation.

Current source has generic pointing, activation, navigation, dictation, named-target matching, and provider routing. There are no dedicated per-domain adapters yet. Phrases such as "next song", "mute meeting", and "zoom map" below are proposed adapter acceptance targets. Test the generic point-and-click equivalent now; label the direct command Not implemented until it exists. A successful generic click does not prove dedicated command support.

## Execution and evidence used by both groups

1. Use desktop Google Chrome and record Chrome version, OS, extension build/commit plus local modifications, device, screen size, browser zoom, site domain, UI language, date, account state, pointer mode, speech mode and selected speech language.
2. Start the Next website, reload the unpacked extension, open its dashboard from the popup, grant the required site/tab/media permissions, calibrate face mode. Verify the basic click, scroll, dictation, pause and stop flows on the local fixture before testing a live site.
3. Sign in normally beforehand where needed. Use owned test accounts, a private GitHub repository, a consenting chat/contact/meeting participant and an existing Netflix subscription. Do not put account passwords, OTPs, cookies or provider keys in test reports.
4. Run each read-only smoke flow once. If it fails, reproduce and log it before moving on to expensive repetitions.
5. For every in-scope interaction test, run three times in face mode, three in broad-hand mode, and three using voice plus pointing. Reset the page, draft and selection between attempts. Reset playback before seek tests. Record any mouse/keyboard assistance after setup.
6. Separate command routing from recognition. Use the dashboard Type a command field for a deterministic check; then repeat aloud and record intended phrase, displayed transcript, interpreted action and actual outcome. Ordinary commands use Jev, hey handsfree requests use Groq, and dictated text must stay literal. For new commands, test both an exact phrase and a polite equivalent after mapping is implemented.
7. Test English and Hindi if both are claimed supported. Keep website UI language English for the first pass so speech-language issues are separate from translated selectors. Run a separate Hindi UI pass only where the site offers it and the adapter claims it.
8. Each site must survive refresh, internal navigation without a page reload, back/forward, switching away and returning, new content appearing, light/dark when available, and 100%/200% browser zoom. Test 1280x720 and 1920x1080 desktop windows. Do not claim mobile support from these tests.
9. On every site test: move away halfway through dwell; hold after a selection without repeating it; lose camera tracking; pause during speech/provider work; change target while a request is pending; disconnect network; deny microphone once. Expected: no unintended action, no late action after pause/target change, clear failure and a usable retry path. Disable provider overrides in a disposable profile to check missing-provider behavior, leaving shared local credentials unchanged.
10. Use permission-denied, signed-out, empty/no-match and unavailable-control states as first-class outcomes. Label unavailable content Blocked or Not applicable with a reason; never Pass.
11. Use normal input once for the same complete workflow, then perform it handsfree from the same starting state. Record elapsed time, command attempts/correct actions, wrong targets, retries, accidental activations and physical assistance. Provider/session metric counts alone are not proof of recognition accuracy.
12. Record command time from end of speech to verified effect. Separately record transcription/provider time and website loading time where observable. Proposed targets, not current measured guarantees: at least 95% correct spoken-command attempts across the site's test set, at least 95% completed in-scope workflows without assistance after setup, median command response under 2 seconds and p95 under 4 seconds excluding page loads, and zero unintended sends, purchases, bookings or meeting departures. Deterministic adapter tests must all pass. Any serious unintended action blocks support regardless of the percentage score.

Record each attempt using:

`Test ID | date | build | Chrome/OS | site/UI language | mode | initial state | intended phrase | transcript | interpreted action | expected | actual | command latency | workflow time | assistance | result | evidence | bug ID`

Results: Pass, Fail, Blocked, Not implemented, Not applicable. Screenshots or recordings must show the relevant effect while excluding private content. Keep private recordings and account screenshots in ignored local-docs, not tracked docs. A bug report includes minimal reproduction steps and whether it also occurs with normal input.

## Message 1: Group A

Sites: Wikipedia, GitHub, Reddit, Amazon, Spotify Web, Netflix.

Please run the common execution checklist above, then these cases. Direct website phrases are proposed features until implemented. Do not declare an entire website supported because its homepage works.

### A1. Wikipedia

Setup: English Wikipedia, signed out, a long article such as India.

- WIKI-01 Search: focus site search, dictate India, stop typing and submit deliberately. Verify the query and intended article, including autocomplete selection if shown.
- WIKI-02 Sections: select a named table-of-contents section. Verify that its heading enters view and pointer coordinates remain correct after scrolling.
- WIKI-03 Links: identify an article-body link, find it by label, review the highlight and open it. Verify destination; browser Back returns to the original article. Finding alone must not activate.
- WIKI-04 Long pages: scroll both directions, follow a citation/reference link and return. Check footer/toolbar controls do not steal selection.
- WIKI-05 Ambiguity: use a repeated link label and a disambiguation page. Ask for a choice rather than selecting an arbitrary match.
- WIKI-06 Layout: repeat after article navigation, theme changes where available and 200% zoom. Mark collapsed or missing sections explicitly.

Complete flow: search India -> open article -> choose section -> follow link -> return -> pause. Pass only when each destination/section is verified and there are no accidental edits or selections.

### A2. GitHub

Setup: one public repository for reading and one private test repository for writes.

- GH-01 Search: search for a repository, open the correct owner/repository and return.
- GH-02 Files: open a folder, then a file. Verify the filename and path; go back to the folder. Test repeated filenames in different folders.
- GH-03 Navigation: open Issues, Pull requests and the README. Verify the correct page; do not confuse links inside content with repository tabs.
- GH-04 Dynamic views: select a branch if available and verify the displayed branch/file content changes. Repeat after GitHub internal navigation.
- GH-05 Dictation: in the private repository, fill an issue title and body. Verify focus and literal text, including words such as scroll down. Stop typing before commands.
- GH-06 Guarded submission: request creation, cancel once, then deliberately confirm one test issue. Verify exactly one issue and its title/body; close it during cleanup. Exercise the actual site handler, including any custom buttons, rather than assuming HTML form protection covers it.
- GH-07 Authorization: try a read-only repository or signed-out state. No attempts to compensate for unavailable write permission.

Complete flow: find repository -> open file -> return -> open Issues -> draft private test issue -> cancel submission. Issue creation is a separate confirmed write test.

### A3. Reddit

Setup: a read-only public page and an owned test space for draft/write testing.

- RED-01 Search: enter a topic, submit and choose one result by title. Verify the intended post.
- RED-02 Feed: scroll until new posts load. Targets must refresh without an increasing cursor delay.
- RED-03 Comments: open comments, expand a collapsed thread and change sorting if available. Verify the correct thread/sort, including repeated Reply labels.
- RED-04 Overlays: open a post in an overlay where the current site uses one, close it and return to the feed. Hidden background targets must not be selectable.
- RED-05 Draft: dictate a reply in the test space. Verify that navigation phrases remain literal during dictation; cancel without posting for the first pass.
- RED-06 Publish: separately request a test reply, cancel once, then confirm once. Verify exactly one reply. Test custom editor submission and cancel pending approval when the target post changes.
- RED-07 States: signed-out login dialog, removed/unavailable content, no results and long threads. Report the actual UI variant and restrictions.

Complete flow: search -> open post -> expand thread -> draft reply -> discard -> return to feed. Voting, posting and replying require separate declared write coverage.

### A4. Amazon

Setup: Amazon India for the first pass. Record region and site language; do not assume amazon.com has identical controls. Start with a product that offers variants and multiple sellers/results.

- AMZ-01 Search: dictate wireless mouse, deliberately submit, select a result by full title and verify the product.
- AMZ-02 Results: distinguish sponsored and ordinary result positions. Apply one available price/brand filter and a sort option; verify the displayed state.
- AMZ-03 Variants: choose a size/color/other variant where offered. Verify the selected variant, price and availability rather than only the thumbnail.
- AMZ-04 Product details: open reviews and return to product details. Check image zoom/popovers and sticky controls do not cause wrong clicks.
- AMZ-05 Cart: in an owned account, explicitly add one test item, verify product/variant/quantity, then remove it and verify the original cart is restored. Remaining dwell must not add multiple copies.
- AMZ-06 Boundaries: keep dwell disabled while inspecting live Buy now/checkout controls. Test accidental activation, pending approval and cancellation against a local representative fixture first. No purchase is part of this plan; do not exercise a potentially unguarded live purchase control to discover whether it is safe. Live cart tests are separate and deliberate.
- AMZ-07 Failures: out-of-stock result, missing variant, location popup and delayed price changes. Do not act on stale labels.

Complete flow: search -> filter -> open product -> select variant -> inspect reviews -> back. Cart modification is a separate intentional test; payment remains outside tested coverage.

### A5. Spotify Web

Setup: an existing Spotify account. Record subscription tier; mark controls unavailable under that tier instead of treating them as adapter failures. Use headphones for the initial pass, then speakers for interference testing.

- SPOT-01 Search: search a known song/artist, select the intended result type and verify title and artist.
- SPOT-02 Playback: proposed play music and pause music commands must reach the player. Verify actual audio/playback state. Pause music must not accidentally pause Handsfree.
- SPOT-03 Tracks: next song/previous song must change the active track where the account permits it. Verify title and artist, including repeated titles.
- SPOT-04 Volume: mute/unmute and volume changes must affect the player. Keep Handsfree listening unless explicitly paused.
- SPOT-05 Seek: move playback to a stated time or seek by a stated interval where available. Verify the resulting position; dragging-only controls need an accessible alternative in the adapter.
- SPOT-06 Navigation: open a playlist/album, switch internal pages and return while playback remains controllable. Test the persistent mini-player and menus.
- SPOT-07 Interference: repeat commands with music through speakers. Music vocals must not become navigation commands; repeat with headphones as a comparison.

Complete flow: search -> play -> pause -> resume -> next track where available -> mute -> stop Handsfree. An ad/restriction period is a distinct state and must not be silently skipped.

### A6. Netflix

Setup: an existing subscription and one selected profile. First verify that playback works normally in the same Google Chrome browser. Standard headless Chromium may lack the required protected-media support and is not sufficient evidence for playback support.

- NF-01 Browse: search a known title, open details and verify title/profile. Distinguish episodes, trailers and the main title.
- NF-02 Playback: play video/pause video must change actual player state. Keep this separate from pause Handsfree.
- NF-03 Seek: seek forward/backward by 10 seconds. Record positions before/after; repeat away from the start/end boundary.
- NF-04 Audio: mute/unmute and volume controls must affect Netflix, not meeting/browser/system audio.
- NF-05 Subtitles: select one subtitle/audio option offered by the title, verify the selected option and visible effect, then restore the original.
- NF-06 Fullscreen: enter/exit using the available controls. Verify Handsfree overlay, targeting and transcript visibility. Record separately whether Escape exits fullscreen, pauses Handsfree or both; user must always have a reliable pause route.
- NF-07 Conditional controls: skip intro/next episode only when those controls exist. Test controller behavior when they disappear. Do not fabricate a successful result on a title without an intro.
- NF-08 Interference: with dialogue playing, no speech from the show should trigger actions. Compare headphones/speakers.

Complete flow: search -> open title -> play -> pause -> resume -> seek -> subtitle change -> exit fullscreen. Playback, subtitles and fullscreen are separate support claims.

### Group A handoff

Return one result table per site, bug IDs, repeat counts and the completed-flow recording where appropriate. Separate head/hand/voice results. List exact supported commands, domains and tested UI states. Do not average passing Wikipedia tests with failing Netflix tests. Any Not implemented item stays visibly unverified until implementation and rerun.

## Message 2: Group B

Sites: WhatsApp Web, Gmail, Google Meet, LinkedIn, IRCTC, Google Maps.

Please use the same execution checklist and result format above. This group tests communication, travel forms and device sharing. Use private test conversations/accounts/meetings. Proposed domain commands do not count as working until they are implemented and verified.

### B1. WhatsApp Web

Setup: link your own account normally. Use Message yourself where available or a consenting test contact. Prepare two chats with similar names and an unread test message. Keep real conversation contents out of provider tests and recordings.

- WA-01 Search/chat selection: search by name, open the correct chat and verify the header. Duplicate names must require disambiguation.
- WA-02 History: scroll older messages, return to newest and verify correct container scrolling. New incoming messages must not shift the target into another chat.
- WA-03 Draft: dictate Hello, this is a Handsfree test. Verify punctuation, focus and literal navigation words; stop typing without sending.
- WA-04 Send gate: explicitly request sending, cancel once, then confirm once. Verify exactly one message in the intended chat. Moving to a different chat before confirmation must cancel the pending send. Check custom Send buttons and Enter submission paths.
- WA-05 Compose changes: alter part of a draft using available editing controls; verify caret position and no duplicate insertions. Mark text-edit commands Not implemented if absent.
- WA-06 Search/menu: search inside a chat where offered, open/close its menu and return. Menus must block targets behind them.
- WA-07 Session: refresh, switch chats, simulate reconnect and leave the linked session signed out. No stale message may send after reconnect.

Complete flow: find test chat -> read -> dictate -> stop typing -> cancel send -> deliberately send once -> verify recipient/content. Deletes, calls and attachments are separate optional coverage, not implied by this flow.

### B2. Gmail

Setup: a test inbox with three known subjects, one draft and a second owned recipient address. Record whether Gmail keyboard shortcuts are enabled; repeat essential adapter flows with them disabled.

- MAIL-01 Search: dictate a known subject, submit and open the exact matching conversation. Verify search and email subject separately.
- MAIL-02 Inbox navigation: open a thread, expand a message, return to inbox and navigate multiple result pages where available.
- MAIL-03 Compose: enter recipient, subject and body using separate focus changes. Verify Gmail recipient chips commit correctly and dictation does not spill between fields.
- MAIL-04 Dictation isolation: say scroll down and close tab in the body while dictating. They must become text. Say stop typing before command tests.
- MAIL-05 Send gate: request send, cancel once, then confirm once to the owned recipient. Verify Sent and recipient inbox contain exactly one correct email. Test Ctrl+Enter/custom-send pathways. A focus/recipient/draft change must invalidate pending approval.
- MAIL-06 Reply: reply to the known test email. Verify conversation and recipient, with Reply all tested separately only on owned test addresses.
- MAIL-07 Reversible actions: archive a test message then restore it; read/unread and draft reopen. Verify the actual item, not an unrelated selected row.
- MAIL-08 Multiple editors: open two compose windows. Dictation and send must bind to the selected draft. Refresh/close/cancel must not publish a draft.

Complete flow: search -> open -> reply draft -> cancel -> compose to owned address -> confirm send -> verify. Attachments, deletion and real recipients remain outside this initial assignment.

### B3. Google Meet

Setup: a private test meeting with one consenting second participant on another device. Use headphones first. Test both start orders: Handsfree before Meet and Meet before Handsfree.

- MEET-01 Pre-join: choose the intended meeting, inspect camera/microphone state, then join deliberately. Verify the correct meeting, not a neighboring link.
- MEET-02 Device sharing: turn Meet camera on while Handsfree tracks. Verify both the meeting video and pointer continue working, including with the popup preview open and closed. Test microphone sharing as well. A device conflict must produce a usable error/recovery, not an unsupported claim of full compatibility.
- MEET-03 Microphone: proposed mute meeting and unmute meeting commands must change Meet's state while Handsfree can still receive commands. Muting Meet must not be confused with pausing Handsfree.
- MEET-04 Camera: camera off/on affects Meet's outgoing video only. Verify that Handsfree tracking does not stop when meeting video is off.
- MEET-05 Controls: captions on/off, raise/lower hand, open/close participants/chat. Verify state changes, including host-restricted/unavailable controls.
- MEET-06 Chat: draft a private test chat message, cancel once and send once only after deliberate confirmation. Verify exactly one message with the second participant.
- MEET-07 Interference: second participant says action phrases; test background conversation, your ordinary discussion, headphones and speakers. No meeting dialogue should cause unintended actions. If ordinary speech and commands cannot be separated, document a required explicit command mode/wake policy before claiming unattended meeting support.
- MEET-08 Sustained load: run a 15-minute call with movement/voice checks at minutes 0, 5, 10 and 15. Record FPS, command latency and losses. Test tab switching, popup closing, camera-off periods and network reconnection.
- MEET-09 Departure: cancel a request to leave; then deliberately confirm departure once. Verify room exit and continued ability to pause/stop Handsfree. Do not test ending a meeting for others unless separately scoped.

Complete flow: pre-join -> join -> mute -> camera off -> captions -> chat draft -> restore device states -> confirm leave. Device coexistence and conversation isolation are blocking acceptance criteria.

### B4. LinkedIn

Setup: an owned account, a chosen job search and a consenting test contact only if messaging is tested.

- LI-01 Jobs search: dictate a role and location into the correct fields. Verify each value and intended result page.
- LI-02 Filters: apply available job-type/experience filters and inspect a result. Verify selected filters and full job title/company, including repeated job titles.
- LI-03 Save: save/unsave one job and verify state; restore the original afterward. Remaining dwell must not toggle repeatedly.
- LI-04 Navigation: open a company/profile and return to the job. Test infinite-scroll list updates, side panels and overlays.
- LI-05 Draft: dictate into an owned test message draft or application field. Verify literal text and focus. Message send, if tested, needs cancel/confirm and a consenting recipient.
- LI-06 Boundaries: inspect an application form without submitting. If the role redirects to an employer site, stop LinkedIn coverage at that domain boundary and record it as a separate integration.
- LI-07 States: no matches, sign-in restriction, unavailable job and loading placeholders must not trigger unrelated controls.

Complete flow: role/location search -> filter -> open job -> save -> return -> unsave. Do not include an actual application submission in initial coverage.

### B5. IRCTC

Setup: official irctc.co.in, normal login when necessary, ordinary availability searches outside booking rushes. Complete site-owned authentication/CAPTCHA/OTP normally; mark these assisted steps in the report. No booking or payment is part of this test plan.

- RAIL-01 Stations: enter origin/destination, select autocomplete entries and verify exact station names/codes. Similar station names must not choose the first match automatically.
- RAIL-02 Date: use the date picker for a future date. Verify day, month and year; previous/next-month buttons must be distinguished from browser navigation.
- RAIL-03 Journey options: choose class/quota where offered and verify selected values. Test dropdown scrolling and repeated option labels.
- RAIL-04 Search: submit deliberately, select a train and verify train number/name and travel date. Inspect availability/fare only.
- RAIL-05 Correction: swap origin/destination, change the date/class and search again. Verify there are no stale selections or duplicated text.
- RAIL-06 Errors: same origin/destination, invalid station, empty required field, no services/results and expired session. Read the site error; no repeated submit loop.
- RAIL-07 Passenger controls: use a local representative fixture with dummy name/age and passenger rows to test focus, dropdowns and validation. Label fixture coverage separately; it cannot certify the authenticated live passenger/booking workflow.
- RAIL-08 Boundaries: pause/stop must remain reachable around login challenges and dialogs. Use a local representative fixture to test Book now/payment activation, stale commands and generic Enter; keep dwell disabled around live transaction controls. Authentication and transactions are unverified/assisted boundaries unless explicitly tested later.

Complete flow: stations -> future date -> class/quota -> search -> inspect availability -> edit journey -> search again. Initial support claim is train search and availability browsing, not ticket booking.

### B6. Google Maps

Setup: Chrome desktop, known origin/destination, initially deny location permission so search is deterministic. Test location permission separately with consent.

- MAP-01 Place search: dictate a known place, choose its exact result and verify place name/address. Multiple same-name businesses must require a choice.
- MAP-02 Result panel: scroll place results independently from the map. Verify map controls and the result list do not steal each other's focus.
- MAP-03 Directions: enter origin/destination separately, select driving/walking/transit where offered and verify the route endpoints and mode. No typing into the wrong autocomplete field.
- MAP-04 Alternatives: choose an alternative route if available. Verify the selected route and distance/time display changed; never claim a live navigation trip from desktop directions.
- MAP-05 Map movement: proposed zoom map in/out and pan commands must move the map, not zoom/scroll the browser page. Verify actual map scale/center changes. Arbitrary canvas points are not ordinary DOM buttons; use available semantic controls/keyboard mechanisms and verify behavior.
- MAP-06 Place details: inspect hours/reviews/photos where available, close overlays and return to results. Preserve correct target coordinates.
- MAP-07 State changes: refresh a directions URL, back/forward, delayed results, no route, permission denied and restricted modes. No stale search result should be selected after new results load.
- MAP-08 Secondary coverage: Street View is a separate optional integration requiring its own enter/exit/move tests. Do not include it in basic Maps support automatically.

Complete flow: find destination -> inspect address -> directions -> origin -> switch travel mode -> inspect alternative -> return to results. Route endpoints and mode must remain correct throughout.

### Group B handoff

Return per-site results, bug IDs, repeat counts, tested account/permission states and exact support boundaries. Include a dedicated Meet device-sharing/conversation-isolation result and an IRCTC assisted-step list. No messages, emails, applications, meeting departures, purchases or bookings may occur accidentally. If any do, stop that flow and record a blocker.

## Implementation and release order

- Run the existing generic controls baseline first. It identifies what works before adapters and supplies real failing examples.
- Implement one domain adapter at a time, with a finite action list, state-aware target resolution, one selected target, explicit user feedback and existing safety gates. New domain verbs need parser/provider-whitelist integration as well as content code. Require domain validation; clear stale targets after navigation.
- For toggle-like actions, make requests stateful: mute when already muted is a no-op, not an unmute. Never interpret pause music as pause Handsfree. Distinguish browser commands from application commands.
- Automate locally reproducible adapter behavior with representative DOM fixtures and deterministic browser inputs. Preserve tests for duplicate labels, hidden/covered controls, changed targets, virtualized lists and missing controls. Add a regression for each real failure that has a reliable seam.
- Verify owned/private live workflows on real Chrome separately. Fixture/headless passes do not prove signed-in site compatibility, protected media playback, actual speech accuracy or hardware coexistence.
- Fix blockers, rerun the failed tests and neighboring workflows, then rerun the full in-scope per-site flow.
- Maintain a support matrix: domain/UI language, supported commands and workflows, browser/build, test date, pass/fail counts, known limitations and evidence. A limitation removes that flow from the supported claim; it does not become a pass.
- Release labels: Generic controls only, Adapter implemented/unverified, Verified named workflows, Partial support, Blocked. No official partnership or universal support is implied.

## Primary references checked

These document platform reference behavior, not Handsfree compatibility.

- Netflix player keyboard controls: https://help.netflix.com/en/node/24855
- Netflix browser requirements: https://help.netflix.com/en/node/30081
- Google Meet controls: https://support.google.com/meet/answer/9298571?hl=en
- Google Maps keyboard/accessibility behavior: https://support.google.com/maps/answer/6396990?hl=en
- IRCTC accessibility facilities: https://contents.irctc.co.in/en/Facilities_for_Visually_Impaired_Users_English.pdf
- GitHub keyboard navigation: https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts
- Gmail keyboard navigation: https://support.google.com/mail/answer/6594?hl=en
- Spotify keyboard navigation: https://support.spotify.com/mt/article/keyboard-shortcuts/
