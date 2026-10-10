# Group B voice-first website support plan

Prepared 2026-10-10. This document specifies the implementation and qualification targets. See [Group B implementation and verification](group-b-support.md) for the current command scope, automated checks and remaining live qualification.

## 1. Outcome and scope

Handsfree should let a person complete supported website workflows by speaking naturally. The person should not need to move a pointer, position their face, gesture at a control, or know the website's keyboard shortcuts. Face and hand control remain available as optional ways to interact. Their presence must not hide gaps in voice support.

Group B contains exactly these six websites:

| Site | Initial scope | Main voice workflows |
| --- | --- | --- |
| WhatsApp | Desktop web.whatsapp.com, linked owned account | Select chats, read messages, dictate and deliberately send test messages |
| Gmail | Desktop mail.google.com, owned test inbox | Search, navigate threads, compose, reply and deliberately send test mail |
| Google Meet | Desktop meet.google.com, private test meeting | Join, manage meeting controls, chat, and qualify camera/microphone coexistence |
| LinkedIn | Desktop linkedin.com, owned account | Search jobs, filter, inspect and save/unsave a test job |
| IRCTC | Desktop irctc.co.in | Enter stations, date and journey options, search trains and inspect availability |
| Google Maps | Desktop maps.google.com | Find places, inspect details, request directions and change route mode |

Wikipedia, GitHub, Reddit, Amazon, Spotify and Netflix are Group A and are specified in the companion Group A plan. These six Group B sites are a separate scope. A working generic click does not establish a site-specific voice capability.

"Almost native" means a tested set of direct commands that understand the site's objects and report verified results. It does not mean full control of every feature on a third-party website.

### Release rules

- A supported journey must work with microphone input alone after initial installation, permissions and account setup.
- Voice selection must resolve named objects without requiring pointer location.
- A command must describe the intended state. “Save this job” should leave it saved, including when it was already saved.
- Missing controls, account restrictions and uncertain targets must produce an explanation or a spoken clarification.
- Listening, transcription, interpretation, execution and verification need distinct failure messages.
- Do not publish a blanket claim such as “supports WhatsApp” or “supports Maps”. Publish named, dated, tested workflows and their account/browser requirements.
- Do not count a mouse-assisted flow as a voice-only pass.

## 2. What exists and what needs building

The repository has a Chrome MV3 extension in `extension/` and a Next website/dashboard in `next/`. Current voice routing supports general browser actions, named targets, numbered choices, search and dictation. It also has an ordinary-command provider path and a separate `hey handsfree` path for broader requests. There is no dedicated adapter catalogue for these six domains yet.

| Component | Current baseline | Work proposed here |
| --- | --- | --- |
| `extension/src/core/parser.ts` | General command parsing | Context-aware site intent candidates, negation, corrections and bounded slot parsing |
| `extension/src/providers.ts` | Ordinary-command classification and broader request handling | Site-specific finite choices, validated site actions and explicit unsupported results |
| `extension/src/background.ts` | Speech routing and cancellation | Voice dialogue state, tab-bound requests, confirmations and action orchestration |
| `extension/src/shared.ts` | Shared settings, intents and messages | Typed site actions, capability reports, clarification messages and execution evidence |
| `extension/src/content/runtime.ts` | General DOM execution | Domain adapter dispatch, postcondition checks and scope-bound target resolution |
| `extension/src/content/dom.ts` | Generic target discovery | Scoped page entities, visible candidates and adapter-specific resolution |
| `extension/src/offscreen.ts` and `speech.ts` | Capture and recognition | Tested voice-only lifecycle, feedback playback and recognizer/TTS coordination |
| Dashboard and overlay | Existing controls and transcript feedback | Voice support status, understandable choices and honest errors |
| Dedicated site adapters | Absent | Six independently testable adapters with explicit capabilities |

This is a plan, not a source-code change. Existing tests establish the generic baseline, not domain support. Verify source behavior again before implementation because other work may change it.

Use the four working Groq keys already selected by the user. Ignore the rejected fifth. This plan needs no new credentials and no environment-file changes.

### Important existing limitations

The current ordinary-command path can classify finite options; it should not be treated as a general text generator. Jev returns decisions over supplied choices. Preserve that contract when adding website actions. [OpenRouter's Jev documentation](https://openrouter.ai/blog/tutorials/how-to-use-jev/)

Current pause stops recognition. A fully stopped microphone cannot hear "resume". A voice-only release therefore needs a clearly separate, optional control-listening state if spoken resume is offered. Hard stop must release capture and report that restarting requires an available external control. Do not advertise a wake command that cannot be heard.

Browser permission prompts, sign-in challenges and some browser-owned dialogs may need initial assistance. Record those setup requirements. A command inside a webpage cannot guarantee control of browser chrome or protected dialogs.

## 3. Priorities and support labels

P0 means required for the first supported voice-only release on that site. P1 means the next extension of its command set. P2 means optional after reliable core journeys. These priorities are implementation choices, not claims about current availability.

Every action also gets one of these runtime states:

| State | Meaning | Voice response example |
| --- | --- | --- |
| Available | The adapter can resolve and execute the action now | “Opening the selected conversation.” |
| Needs choice | Several grounded targets fit | “Do you mean Mira Shah or Mira Patel?” |
| Needs confirmation | The action changes account data or publishes content | “Send this email to the selected test recipient?” |
| Unavailable here | The site/page/account lacks the control | “That control is unavailable in this view.” |
| Not implemented | The adapter has no supported execution path | "Playlist editing is not supported in this version." |
| Failed | The action was attempted but its result was not verified | "I could not verify that the item was added. I won't add it again automatically." |
| Already satisfied | The requested state already exists | “That job is already saved.” |

The adapter must never translate unavailable actions into a vaguely similar write. “Save this job” must not send a message or apply for the job.

## 4. Voice-only session and shared commands

Offer a voice-focused session that can run without camera capture or calibration. This is a proposed mode; verify the settings and lifecycle changes needed rather than assuming the current dashboard already has it. Keep face and hand settings intact for users who want them.

### Initial setup

1. Install/load the extension and open the dashboard.
2. Grant microphone and site access through Chrome's normal permission controls.
3. Sign into the chosen test accounts and set the website UI language.
4. Select a supported recognition language and voice-focused operation.
5. Turn off camera capture and dwell for the first voice-only test.
6. Start listening, then confirm transcript feedback and an audible or otherwise accessible acknowledgment.
7. Complete a local voice-command fixture before opening real websites.

After step 6, supported journeys must require no mouse, keyboard, face or hand input. A setup assistant may perform steps that Chrome itself does not expose to the extension. Record this honestly.

### Shared voice catalogue

| Intent | Natural phrases | Expected result |
| --- | --- | --- |
| Open site | “Open WhatsApp”, “take me to Maps” | Open the configured domain and announce the destination |
| Select tab | “Switch to Gmail”, “go back to the Meet tab” | Resolve the tab by site/title; ask if several match |
| Browser back/forward | "Go back a page", "browser forward" | Browser history navigation, not a site-specific previous-result command |
| Reload | "Refresh this page" | Reload current tab and invalidate old targets |
| Scroll | "Scroll down a little", "go down a page", "top of this page" | Bounded scroll; no continuing motion without a stop path |
| Find visible object | "Find the reviews link", "show me the second result" | Identify and announce the object without activating a write |
| Select choice | "The second one", "choose the one by Radiohead" | Use the current numbered list or entity properties |
| Ask available actions | "What can I do here?", "what can I say on this page?" | Read concise capabilities grounded in the current page |
| Clarify target | "Which item are you talking about?" | Repeat the pending target and choices |
| Confirm/cancel | "Confirm adding that item", "cancel that request" | Resolve only the current bound pending action |
| Repeat feedback | "Say that again" | Repeat assistant feedback, not the last site action |
| Stop current work | "Cancel the search", "stop that action" | Cancel pending work and queued steps; explain any completed step |
| Pause Handsfree | "Pause Handsfree", "stop listening for page commands" | Immediate explicit session transition with no late action |
| Hard stop | "Stop Handsfree and release the microphone" | End capture and explain restart requirements |
| Help | "Explain the choices", "how do I select a result?" | Short instruction without requiring a click |

“Pause Handsfree” always controls Handsfree. “Mute the meeting” controls only the Meet microphone. Plain “stop” cancels pending work and asks what to stop when message, meeting and session meanings conflict. Do not change existing behavior silently; specify and test migration behavior.

## 5. Natural-language understanding

### Meaning before exact wording

The same intent should accept terse, polite and conversational phrasing:

| Meaning | Test variants |
| --- | --- |
| Select contact | “Open my test chat with Mira”, “find the conversation with Sam” |
| Send message | “Send this to my test chat”, “please send the selected draft” |
| Meeting audio | “Mute my Meet microphone”, “turn off my meeting mic” |
| Job search | “Find data analyst jobs in Bengaluru”, “look for remote roles” |
| Train search | “Find trains from Chennai to Bengaluru next Friday” |
| Place search | “Look up the Bengaluru Palace”, “find cafes near this place” |
| Open result | "Open the second result", "the second one please", "choose number two" |
| Seek | "Go forward thirty seconds", "skip half a minute", "jump to two minutes ten" |
| Explicit correction | “Actually, choose the third one”, “no, I meant the other contact”, “change the date to Friday” |
| Cancellation | "Never mind", "cancel it", "don't do that", "leave it as it is" |

These are evaluation examples. They are not a license to act whenever the recognizer hears a related word. “Send this” in an email draft is literal text. “Do not send it” must cancel. “How do I change the route?” asks for help. “Mute the meeting” must never stop Handsfree capture.

Support proposed Hinglish variants deliberately, including “Mira ko message bhejo”, “meeting ka mic band karo”, “Chennai se Bengaluru train khojo”, “walking directions dikhao” and “doosri job kholo”. Preserve names and titles in their original script. Do not claim Hindi or Hinglish support until recognition, interpretation and dialogue have all passed that language's tests. English UI selectors and Hindi speech are separate test dimensions.

### Interpretation order

1. Honor explicit emergency/session cancellation before provider work.
2. If dictating, preserve literal speech unless the reserved dictation-exit phrase is spoken.
3. Resolve an existing clarification or confirmation only if it is still valid.
4. Respect explicit site, tab, object type and action scope.
5. Generate candidate actions allowed by the active site's capabilities.
6. Parse bounded values such as ordinal, time, volume, quantity and an utterance-span query.
7. Classify unresolved ordinary speech using finite Jev choices.
8. Use the existing `hey handsfree` route for broader interpretation or grounded answers.
9. Validate the action, values, permissions, target freshness and confirmation policy in code.
10. Execute once, verify, update dialogue context and report the result.

Do not let a generic “next” rule consume a next chat, train or result before its active site adapter sees it. Do not let an ordinary-command cloud call block urgent pause. Preserve existing cancellation and request timeouts.

### Jev and slot extraction

Jev should select among a bounded list such as `gmail.search`, `whatsapp.sendMessage`, `meet.muteMicrophone`, `maps.setRouteMode`, `clarify`, `help`, `none`. Candidate generation happens in application code. Include the current domain, object type and available capabilities, without shipping the whole page.

Time, percentage and ordinal parsers should run locally. Search strings and dictated text need bounded extraction from the user's utterance. For known patterns, extract the actual span rather than inventing text. For uncertain title boundaries, offer candidate title spans or ask the user to repeat the title separately. Use Groq structured extraction only on the existing broader request route, with schema validation and the same action whitelist. Never assume Jev will emit arbitrary generated JSON strings.

Classifier confidence alone is insufficient. Execution also requires a valid action, a grounded target and a supported state. Select thresholds from validation data separately for read actions and writes. A low-confidence write must ask or decline.

### Context and references

Maintain context per tab and document revision:

- Active site, page type, current editor/meeting/form state.
- Current chat/thread/message, email/draft, meeting/participant, job, station pair/train or place/route with stable IDs where available.
- Voice-selected entity and its type.
- Most recent spoken choices, their order and source revision.
- Pending clarification or confirmation with an expiry.
- Last verified action, its result and any supported inverse.

"This" refers to the voice-selected item or unambiguous current entity. It never requires camera direction. If a page contains several chats, drafts, jobs or places, a pronoun asks for a choice unless the user selected one. “The second one” uses the list most recently announced by Handsfree, not an unspoken list inferred from a changing page.

Expire choices after relevant navigation, rerender, filtering or tab change. Before executing a pending request, resolve the entity again. A matching label alone does not establish that it is the same chat, thread, job, train or place.

### Multi-step speech

Accept “find trains from Chennai to Bengaluru next week, then show morning departures” as a proposed bounded plan of supported read actions. Announce the steps, run them sequentially and verify each. If a step needs clarification, stop the sequence there.

A mixed request such as “find a train and book it” stops before the excluded transaction; a message or email send requires a confirmation gate. Do not keep executing later steps after a failed step. "Cancel" cancels the remaining plan. Report completed changes separately; cancellation cannot reverse everything automatically.

## 6. Execution design

Create proposed modules under `extension/src/sites/`: `registry.ts`, `types.ts`, `context.ts`, `resolver.ts`, `executor.ts`, plus `whatsapp.ts`, `gmail.ts`, `meet.ts`, `linkedin.ts`, `irctc.ts` and `maps.ts`. These paths are design proposals, not existing files.

Each adapter owns these responsibilities:

| Responsibility | Required behavior |
| --- | --- |
| Match | Exact allowed hostname checks, explicit regional scope and known page types |
| Inspect | Discover visible entities and controls; report capabilities and restrictions |
| Resolve | Match requested object by identity/type/label and produce choices when needed |
| Prepare | Validate arguments and return a human-readable action preview |
| Execute | Use a supported semantic interaction and respect cancellation |
| Verify | Check the requested final state with a deadline |
| Explain | Return clear success, failure, unsupported or ambiguity feedback |

Represent a site action with an action ID, site ID, tab ID, document revision, entity reference, validated arguments, request ID and optional confirmation reference. Keep all executable action IDs in code. Provider output cannot supply JavaScript, arbitrary selectors, arbitrary navigation schemes or a new execution function.

Entity references should include site identity and object type. A contact name, email subject, job title, train name and place name can be identical. They must not be interchangeable. Attach chat/account identity, message/thread ID, recipient set, job company/location, train number/date or place address/coordinates.

### Target resolution strategy

Prefer semantic roles, accessible names, labels, relationships and stable visible link destinations. Scope lookups to the current editor, conversation, meeting panel, result list, form or map route. Use site-specific selectors only where necessary and document what page variant each selector supports.

Exclude hidden, disabled, background-modal and detached controls. Recheck enabled state immediately before activation. Treat DOM mutation and SPA navigation as invalidation events. Never select an offscreen duplicate simply because it appears first in DOM order.

Use page-supported inputs/events and test that actual site handlers respond. Setting an input's `value` without updating a controlled editor is insufficient. Synthetic keyboard events may not behave like real trusted input. Do not claim a shortcut works merely because an event was dispatched.

Browser-owned dialogs, location prompts and picker controls need separate investigation because webpage commands may not control them. Test only supported paths and describe any setup assistance required.

### Verification examples

| Action | Required evidence |
| --- | --- |
| Open chat/thread/job/train/place | Current entity identity or verified destination |
| Set filter/sort/form | Selected control state and refreshed result context |
| Save job | Desired saved state associated with the correct role/company/location |
| Send chat/email | Exactly one outgoing item with correct recipient, content summary and thread |
| Join/leave Meet | Correct meeting identity and own participant state |
| Change job save | Desired saved state for exact title/company/location |
| Search trains | Results correspond to exact station codes, date, class and quota |
| Set directions | Actual route endpoints and mode match the confirmed request |

A timeout produces an uncertain result, not success. Read operations may retry after rebuilding context. Message/email sends and other mutations must not retry automatically when the first outcome is unknown.

## 7. Confirmation, writes and undo

Use one policy across adapters. Do not delegate confirmation decisions to the language model.

P0 policy: account mutations require a spoken preview and explicit voice confirmation. This includes message/email sending, meeting join/leave, saved-job changes and any other account mutation. Once reliability is proven, an explicitly configured reduced-confirmation preference may be considered for reversible reactions. It is outside the initial release.

A confirmation is bound to the exact action, entity, desired state, arguments, tab and document revision. "Yes" resolves only one current pending request. Reject an expired confirmation and announce why. Cancel it on navigation, relevant entity change, hard pause or a new incompatible request.

Before a Group B write, state the exact target. Examples: “Send this message to the selected test chat?” or “Send this email to the owned test address?” The user can answer "confirm", "no", or correct the target.

IRCTC booking/payment, ending a Meet for everyone, bulk outreach, account deletion and changes outside the declared workflows are excluded. Test their rejection with local fixtures. Do not activate excluded transaction controls to discover whether a guard works.

Undo is action-specific. Restoring a saved-job state is possible only if its prior state was known and the same job is still available. Browser back is navigation, not undo. A sent message/email may not be recoverable. Tell the user which inverse is available and confirm it when required.

## 8. Dictation and editing without pointing

Every editor workflow needs voice field selection. “Write the subject” must locate the selected email subject field. “Write a reply” must select the correct message or email editor. A generic "start typing" into an unknown focused control does not count as native support.

Proposed editor commands:

| Command | Behavior |
| --- | --- |
| “Write the subject” | Select the scoped email subject field and begin literal dictation |
| “Write the message/reply” | Resolve the correct chat/email editor and begin literal dictation |
| "Finish dictation" | Leave literal mode and return to command mode |
| "Read back the draft" | Read the scoped draft if speech output is implemented |
| "Replace the last sentence with ..." | Show/read the proposed edit; change only a resolved text range |
| "Delete the last word" | Edit the active draft using a verified caret or tracked insertion range |
| “Select the recipient field” | Focus the scoped recipient field without pointer input |
| "Clear this draft" | Confirm clearing the identified draft |
| “Preview this message” | Open the available preview without sending |
| “Send the message/email” | Announce recipient and content summary, then await confirmation |

Use a deliberately reserved exit phrase with a documented way to dictate that phrase literally. Test dictation containing "scroll down", "send", "like this", "cancel" and quoted commands. These words must remain text while literal mode is active, except for an explicitly documented emergency stop.

Never send passwords, OTPs or payment fields to the classification provider. Refuse dictation into protected fields if the speech pipeline cannot meet the required privacy boundary. Do not announce sensitive values aloud. Ordinary page metadata should be minimized before cloud classification.

Speech output is a proposed requirement for complete eyes-free choices and errors. The current visual transcript is not proof of spoken feedback. Build and test TTS separately, including interrupt, volume, microphone echo and no repeated acknowledgments. Avoid feeding the assistant's own voice back into execution.

## 9. WhatsApp Web command catalogue

Initial scope is desktop WhatsApp Web with an owned linked account. Chat and message identities must remain bound to the visible conversation. Do not capture private conversation bodies in logs.

| ID | Priority | Voice examples | Resolution and verified outcome |
| --- | --- | --- | --- |
| WA01 | P0 | “Search for Alex”, “open my test chat” | Resolve chat by exact header/account identity; duplicate names require spoken choice. |
| WA02 | P0 | “Show unread chats”, “open the next chat” | Announce bounded candidates and verify selected chat header. |
| WA03 | P0 | “Read the latest message”, “read the previous message” | Read only the selected conversation and message; redact content from diagnostics. |
| WA04 | P0 | “Go to the newest message”, “scroll older messages” | Scroll the message pane, not the chat list; re-resolve after incoming messages. |
| WA05 | P0 | “Write a message”, “finish dictation” | Focus the selected chat composer and preserve literal command words. |
| WA06 | P0 | “Send this to my test chat” | Preview recipient and content summary; confirm once; verify exactly one message. |
| WA07 | P0 | “Cancel sending”, “clear this draft” | Cancel pending send or confirm clearing only the bound draft. |
| WA08 | P1 | “Search this chat for invoice” | Use in-chat search and verify search scope/results. |
| WA09 | P1 | “Open chat info”, “close chat info” | Operate the current chat panel and restore prior context. |
| WA10 | P1 | “Reply to that message” | Resolve the selected message and verify quoted reply target. |
| WA11 | P2 | “Call this contact” | Unavailable in initial release; no call without separately qualified flow. |

Message content is sensitive. Do not send to non-consenting recipients, automate authentication, handle OTPs, delete conversations, or claim calls/attachments unless separately implemented and qualified.

## 10. Gmail command catalogue

Initial scope is desktop Gmail in an owned test account. Bind each compose window and draft to its own message identity, recipient set and editor revision.

| ID | Priority | Voice examples | Resolution and verified outcome |
| --- | --- | --- | --- |
| GM01 | P0 | “Search Gmail for project update” | Submit query deliberately and verify exact conversation and subject. |
| GM02 | P0 | “Open the second result”, “open the newest matching email” | Resolve candidate by sender, subject and date; ask when ambiguous. |
| GM03 | P0 | “Expand the latest message”, “go back to inbox” | Control thread expansion and inbox navigation independently. |
| GM04 | P0 | “Compose an email”, “write the subject” | Select the intended compose window and semantic recipient/subject/body fields. |
| GM05 | P0 | “Send this to my test address” | Read back recipient and subject; require explicit confirmation and verify Sent plus recipient inbox. |
| GM06 | P0 | “Reply to this email” | Bind reply to selected message; distinguish Reply from Reply all. |
| GM07 | P0 | “Archive this conversation”, “restore that email” | Resolve exact thread and verify archive state/reversal. |
| GM08 | P0 | “Mark as unread”, “mark as read” | Set desired state on the selected conversation, not an adjacent row. |
| GM09 | P1 | “Switch to the other draft” | Select draft by recipient/subject and bind dictation to that editor. |
| GM10 | P1 | “Discard this draft” | Confirm exact draft identity before deletion. |
| GM11 | P2 | “Attach the report” | Unavailable until file selection and attachment verification receive separate safety qualification. |

Never send to an unverified recipient. Do not automate password, OTP, recovery or security prompts. Deletion, forwarding to external recipients, bulk actions, attachment selection and confidential content are outside initial scope.

## 11. Google Meet command catalogue

Initial scope is a private test meeting with a consenting participant on a second device. Meet microphone/camera and Handsfree capture are distinct device states and must be reported separately.

| ID | Priority | Voice examples | Resolution and verified outcome |
| --- | --- | --- | --- |
| ME01 | P0 | “Open my test meeting”, “join this meeting” | Resolve meeting identity; joining requires preview and explicit confirmation. |
| ME02 | P0 | “Mute my meeting microphone”, “unmute Meet” | Set Meet mic state and verify it; Handsfree listening remains a separate state. |
| ME03 | P0 | “Turn my Meet camera off/on” | Verify outgoing Meet camera while independently observing Handsfree tracking. |
| ME04 | P0 | “Turn captions on”, “turn captions off” | Set caption state when available and report restrictions. |
| ME05 | P0 | “Raise my hand”, “lower my hand” | Verify hand state for this meeting. |
| ME06 | P0 | “Open participants”, “open meeting chat” | Open scoped panels and avoid controls behind overlays. |
| ME07 | P0 | “Write a chat message” | Dictate to the current meeting chat; preview destination and content summary. |
| ME08 | P0 | “Send this to the meeting” | Explicit confirmation; verify exactly one message in the current meeting. |
| ME09 | P1 | “Present this tab” | Not supported until browser-owned picker/permission boundaries are qualified. |
| ME10 | P1 | “Leave the meeting” | Preview meeting identity and require confirmation; verify own departure only. |

Do not end a meeting for everyone, admit unknown participants, record calls or change host/security settings in initial scope. Conversation audio must not trigger commands. Test device contention in both startup orders and document usable recovery.

## 12. LinkedIn command catalogue

Initial scope is desktop LinkedIn job search and reversible saved-job state in an owned account. Employer-hosted application forms are a separate domain boundary.

| ID | Priority | Voice examples | Resolution and verified outcome |
| --- | --- | --- | --- |
| LI01 | P0 | “Search LinkedIn jobs for data analyst” | Enter query and verify job result context. |
| LI02 | P0 | “Set location to Bengaluru” | Use the correct location suggestion and verify selected location. |
| LI03 | P0 | “Filter for remote jobs”, “choose full time” | Set only available filters and verify active chips/results. |
| LI04 | P0 | “Open the second job” | Announce title, company and location; clarify duplicates. |
| LI05 | P0 | “Read job details”, “return to results” | Inspect selected role and preserve result context. |
| LI06 | P0 | “Save this job”, “unsave this job” | Use desired state, confirm mutation and verify same job identity. |
| LI07 | P1 | “Show the company profile” | Open scoped company link and return to selected job. |
| LI08 | P1 | “Draft a message to my test contact” | Only if owned/consenting test contact; dictate without sending. |
| LI09 | P1 | “Apply for this role” | Stop at employer redirect; no submission in initial scope. |
| LI10 | P2 | “Send this connection request” | Not supported until recipient identity, note and confirmation flow are qualified. |

Do not scrape profiles, automate bulk outreach, send real applications, infer job fit as fact or continue silently to a third-party employer site. Save/unsave tests must restore the original state.

## 13. IRCTC command catalogue

Initial scope is train search and availability browsing on the official IRCTC desktop site. Authentication challenges, CAPTCHA and OTP remain site-owned assisted steps. Booking and payment are excluded.

| ID | Priority | Voice examples | Resolution and verified outcome |
| --- | --- | --- | --- |
| IR01 | P0 | “Set origin to Chennai Central” | Choose exact station suggestion and verify station name/code. |
| IR02 | P0 | “Set destination to Bengaluru City” | Resolve exact destination separately; similar names require clarification. |
| IR03 | P0 | “Travel on 18 November 2026” | Set and verify full date including year; reject past/invalid dates. |
| IR04 | P0 | “Choose AC three tier”, “select quota” | Set only visible options and announce final values. |
| IR05 | P0 | “Search trains” | Submit once after previewing origin, destination, date and options. |
| IR06 | P0 | “Open train 12627” | Verify train number/name, journey date and route. |
| IR07 | P0 | “Show availability”, “read the fare” | Read displayed availability/fare as transient site data with timestamp/context. |
| IR08 | P0 | “Swap origin and destination” | Swap explicitly and verify both fields before searching again. |
| IR09 | P1 | “Sort by departure time” | Only if exposed; verify actual sort state. |
| IR10 | P1 | “Add passenger” | Fixture-only dummy data initially; no live passenger details or booking. |
| IR11 | P2 | “Book this ticket” | Rejected in initial release; never activate booking/payment controls. |

Use local fixtures with dummy passenger data for passenger-row semantics. Live CAPTCHA/OTP/login completion requires the user. No booking, payment, cancellation, passenger storage or transaction submission is in scope; test transaction rejection locally.

## 14. Google Maps command catalogue

Initial scope is desktop place search, place details and route planning. Place results, map canvas and directions panels are separate entity scopes.

| ID | Priority | Voice examples | Resolution and verified outcome |
| --- | --- | --- | --- |
| MAP01 | P0 | “Find the Bengaluru Palace” | Resolve place by name/address and ask when same-name results exist. |
| MAP02 | P0 | “Open the second result” | Bind ordinal to the latest announced list and verify place identity. |
| MAP03 | P0 | “Read the address”, “show opening hours” | Read only visible current-place facts and identify unavailable values. |
| MAP04 | P0 | “Get directions from home to the airport” | Resolve both endpoints separately; require confirmation of exact places. |
| MAP05 | P0 | “Use public transit”, “switch to walking” | Set route mode and verify endpoints/mode. |
| MAP06 | P0 | “Choose the fastest route” | Select among announced alternatives and verify route summary. |
| MAP07 | P0 | “Zoom the map in”, “zoom out one level” | Change map scale using supported controls; verify map, not browser zoom. |
| MAP08 | P0 | “Pan the map east” | Only if a semantic keyboard/control route is available; verify center changed. |
| MAP09 | P1 | “Search near this place for cafes” | Use current place as grounded location and verify result scope. |
| MAP10 | P1 | “Avoid tolls”, “avoid highways” | Set available route options and verify route recomputation. |
| MAP11 | P2 | “Start navigation” | Not claimed on desktop. Mobile navigation and Street View require separate adapters. |

Location permission is optional for deterministic text search and must be requested only through normal browser controls. Do not claim live navigation from desktop directions. Arbitrary map-canvas coordinates are not stable semantic targets; unavailable actions must be explained.

## 15. Ambiguity and failure catalogue

| Situation | Expected behavior |
| --- | --- |
| “Send this” with no bound conversation/draft | Ask which chat or compose window; perform no write |
| Duplicate contact or recipient names | Announce available distinguishing details; require a choice |
| Two Gmail compose windows | Bind to the selected window and verify its recipient/subject |
| “Join” with multiple Meet links | Ask which meeting and read its identity before joining |
| Similar station names/codes | Ask for exact station; never take first autocomplete result |
| Place names with multiple matches | Announce address/area and require a choice |
| “Next” on a changing result list | Use only the most recently announced list revision |
| “Mute the meeting” while dictating | Keep literal dictation unless explicitly addressed as a control |
| “Do not send it” | Cancel pending publication; no submit |
| "Actually the third one" before execution | Replace pending selection and invalidate old confirmation |
| Tab switched during provider request | Cancel/revalidate according to request binding; no action in a different tab |
| CAPTCHA, OTP or sign-in challenge | Explain the assisted boundary; never guess or replay credentials |
| Meeting device conflict | Identify which capture failed and provide a usable stop/recovery path |
| IRCTC result changed after refresh | Reconfirm date, stations and train identity before any further action |
| Location permission denied | Continue text search where possible; do not repeatedly prompt |
| Network disconnected | Distinguish provider failure from page failure; no stale queued action |
| Permission denied | Explain missing permission without repeatedly prompting |
| UI changed unexpectedly | Mark adapter action unavailable/failed and retain generic navigation help |
| Outcome of write uncertain | Report uncertainty, inspect current state, never blind retry |
| Assistant speech heard by microphone | No new site action from self-generated feedback |
| Participant or website audio contains command phrases | No unintended action; test interference controls and listening policy |
| Browser-native dialog appears | Explain boundary and record assistance if needed |

A practical voice interface needs short questions. “Which contact: one, Mira Shah; or two, Mira Patel?” is useful. Reading dozens of results is not. Announce up to five candidates per batch and support "more choices".

## 16. Implementation work packages

### Package 1: Baseline and scope contract

Inspect current parser, provider routing, safety guards, dictation, cancellation and media lifecycle. Record current generic behavior separately from proposed adapter behavior. Define six site IDs, action IDs, exact allowed hostnames, capability states, P0 journeys and fixture-only transaction rejection.

Completion: source baseline documented; no current generic click is mislabeled as domain support.

### Package 2: Shared voice dialogue

Implement tab-bound selection, clarification, confirmation, cancellation, request revision binding and expiry. Add field-name dictation transitions for message, email and meeting-chat editors. Define a clear, tested way to dictate the reserved exit phrase literally.

Completion: a local fixture completes search, spoken choice, field selection, literal draft, cancellation and confirmed test submission without pointing.

### Package 3: Natural-language routing

Add domain-aware candidates before generic shortcuts. Keep station/date/ordinal/recipient parsing local and bounded. Preserve negation, corrections and explicit unsupported results. Build held-out phrase sets before tuning; provider output cannot invent an action or recipient.

Completion: paraphrases route only to finite actions and malformed/out-of-range values are declined or clarified.

### Package 4: Adapter infrastructure

Implement registry, context invalidation, semantic resolver, execution timeouts, desired-state changes, postcondition evidence and spoken capability reports. Build fixtures for duplicates, hidden overlays, disabled controls, stale forms, virtualized results and custom editors.

Completion: stale targets cause no action; uncertain writes are never retried blindly.

### Package 5: WhatsApp and Gmail read/draft flows

Implement chat/thread search, identity announcements, field-bound composition and private test drafts. Treat each compose window as a separate entity. Keep private message bodies out of logs.

Completion: read and draft journeys pass, including duplicate contacts, multiple drafts, tab switches and literal command words.

### Package 6: Guarded message publication

Add confirmation tied to recipient, conversation, draft revision and tab. Exercise custom buttons and Enter paths. Verify exactly one outgoing message/email and invalidate confirmation after a target or recipient change.

Completion: positive, cancel, stale-confirmation, duplicate-command and uncertain-result cases pass in fixtures before one deliberate owned-account live test.

### Package 7: Meet coexistence and LinkedIn jobs

Qualify camera/microphone sharing in both startup orders and test command isolation from participant speech. Add LinkedIn job search, filters and reversible saved-job state. Keep applications and meeting-wide destructive controls unavailable.

Completion: device failures have usable recovery; selected job identity and saved state are verified.

### Package 8: IRCTC search and Maps routes

Implement station/date/class/quota validation, result identity and route endpoint/mode state. Keep IRCTC passenger booking/payment excluded. Treat map canvas movement, mobile navigation and Street View as separate support claims.

Completion: invalid forms do not submit, stale results are rejected, and route state is verified after recomputation.

### Package 9: Live qualification and regression

Run local deterministic tests, typed-command tests, spoken tests and real-browser account workflows as separate evidence. Fix failures and rerun affected cases, adjacent flows and shared cancellation checks. Test face and hand regressions independently.

Completion: release gates pass per named workflow and assisted steps are explicitly listed.

## 17. Test layers and fixtures

| Layer | What it proves | What it cannot prove |
| --- | --- | --- |
| Parser/slot tests | Phrase meaning, negation, bounded arguments | Microphone recognition or real site interaction |
| Provider contract tests | Finite choices, schema rejection, timeout/cancel | Live provider accuracy across accents |
| Adapter fixture tests | Resolution, desired state, confirmation, verification | Current live DOM/account/DRM behavior |
| Injected-transcript extension tests | Routing through background/content and dialogue | Acoustic speech recognition |
| Live typed-command tests | Real site resolution and execution | Voice-only usability or spoken accuracy |
| Live spoken tests | Recognition, intent, dialogue, execution together | Every future website version |
| Face/hand regression tests | Existing optional input still works | Voice-only completeness |

Use representative local DOM fixtures, not copied private pages. Include repeated labels, multiple compose windows, hidden modals, controlled editors, delayed rerenders, virtualized lists, disabled controls, route recomputation and custom submission buttons. Record which live variant inspired each fixture without account data.

Tests should assert meaningful outcomes: the correct entity changes, the draft stays literal, the wrong object remains unchanged, and only one mutation occurs. Avoid tests that merely mirror a selector or assert that a handler was called.

## 18. Natural-language evaluation set

For each implemented P0 action, create at least ten positive phrases: four development phrases and six held-out phrases. Include terse commands, politeness, reordered words, object names, synonyms and corrections. Do not tune against the held-out set and still call it held out.

Create at least 200 shared negative/ambiguous examples across the six sites, covering commentary, questions, negation, dictation, unsupported action, wrong domain, duplicate entity, stale selection and background media speech. Balance these categories and record their counts.

For each write action, explicitly test:

1. Valid request with a bound target and owned test account.
2. Negated request (“do not send”, “do not join”) with no execution.
3. Help question (“how do I send this?”) with no execution.
4. Literal dictation containing the action phrase.
5. Duplicate chat/contact/job/place with a required clarification.
6. Request after navigation invalidates the selected entity.
7. “Actually, don't do that” while confirmation is pending.
8. Confirmation after recipient, job or meeting target changed.
9. Repeating a desired state such as “save this job” when already saved.
10. Repeating a send request after an uncertain result; never blindly duplicate.
11. Participant speech containing a command phrase during Meet.
12. A read-only account or uncommitted IRCTC/Maps form value.

Run English first. If Hindi/Hinglish is claimed, create independent language-specific development and held-out sets. Recognition language, transcript language and website UI language must be recorded separately.

Use at least three consenting speakers for initial spoken qualification, with different accents or speech rates. Include quiet speech and normal conversational speed. Treat this as initial evidence, not proof for all people with speech impairments. Add individual-user calibration and a configurable retry/clarification strategy without requiring exaggerated pronunciation.

## 19. Live test setup and recording

Record date, build/commit, local modifications, OS, Chrome version, viewport, zoom, microphone, headphones/speakers, recognition language, site/UI language, account tier and page type. Never record passwords, OTPs, cookies or provider keys.

Use owned WhatsApp and Gmail test accounts, a private Meet with a consenting participant, an owned LinkedIn account and IRCTC search access. Keep private message content out of recordings. Do not send to real recipients or create bookings/payments.

For each attempt record:

`Case ID | site | initial state | intended phrase | recognized transcript | resolved intent/entity | confirmation | expected state | observed state | end-of-speech-to-effect latency | retries | physical assistance | result | evidence | bug`

Results are Pass, Fail, Blocked, Not implemented or Not applicable. A missing permission, login, meeting device or unavailable account control is Blocked/Not applicable, never Pass. A fallback to face or hand is an assisted result, never a voice-only Pass.

Store private recordings and screenshots in ignored local storage. Prefer sanitized fixture evidence for tracked documentation. Normal diagnostic logs should record action IDs, timing, result categories and revisions without raw transcripts or page content. Any temporary detailed QA capture should be explicit, local and removable.

## 20. Voice-only scripted journeys

Run every journey three times from a reset starting state. Use different held-out phrasing on each repetition. Disable camera and dwell. No pointing or keyboard assistance after setup. Record every clarification and retry. Test each confirmed write separately and clean up deliberately.

### WhatsApp Web

1. Search for a consenting test contact, distinguish similar names, open the exact chat and read the latest test message. Scroll older/newer without moving the chat-list selection.
2. Dictate a draft containing “scroll down”, “send” and “like this”. Finish dictation, verify literal text and cancel the draft. No message should be sent.
3. Dictate again, preview the intended recipient and content, cancel once, then separately confirm one test send. Verify exactly one message in the selected chat. Switch chats while approval is pending and verify it expires.

### Gmail

1. Search a known subject, open the exact conversation, expand a message and return to the inbox. Test repeated subjects and sender ambiguity.
2. Compose to the owned secondary address. Dictate recipient, subject and body in distinct fields. Include command phrases in the body, finish dictation and verify no command executes.
3. Cancel one send, then separately confirm one test email. Verify Sent and recipient inbox. Repeat with two compose windows, then archive/restore a test thread.

### Google Meet

1. Start with Handsfree first, then Meet first. Join the intended private meeting, verify camera/microphone states and preserve an external pause/stop route.
2. Mute/unmute the Meet microphone and turn camera off/on while checking Handsfree recognition/tracking. Repeat with popup preview open/closed and report device conflicts.
3. Enable captions, raise/lower hand, draft/cancel/send one private chat message, then confirm leaving the test call. A consenting participant says command-like phrases during the interference test; none may trigger actions.

### LinkedIn

1. Search a role and location, apply available filters, open a job and verify full title/company/location, then return to results.
2. Save a selected test job, verify state, navigate away/back, unsave and verify restoration. Repeat with duplicate job titles and infinite-scroll additions.
3. Inspect an application form but stop before submission. If it redirects to an employer site, record the domain boundary. Draft a test message only with a consenting contact; do not send in baseline qualification.

### IRCTC

1. Enter exact origin/destination stations, future date, class and quota. Review the complete search summary before submitting and verify the returned train list.
2. Open a train by number, inspect displayed availability/fare, change date and swap endpoints, then search again. Confirm stale results are not selected after recomputation.
3. Exercise empty fields, same station, invalid station, no results and expired session. Complete CAPTCHA/OTP only as a user-assisted boundary. Verify booking and payment intents are rejected without activating controls.

### Google Maps

1. Search a known place, disambiguate same-name results, read address/hours and return to results. Deny location permission for the deterministic pass.
2. Set route endpoints separately, choose driving/walking/transit and an alternate route, then verify endpoints, mode and displayed summary.
3. Zoom/pan using supported semantic controls, test browser zoom separately, refresh/back-forward and permission-denied states. Do not claim desktop turn-by-turn navigation or Street View from route planning coverage.

## 21. Shared robustness matrix

Apply these cases to every implemented site and action family:

- Refresh, same-tab internal navigation, browser back/forward and leaving/returning to the tab.
- Provider response arriving after tab switch, pause, stop, correction or entity change.
- 100% and 200% zoom at 1280×720 and 1920×1080 desktop viewports.
- Signed-out state, account restriction, empty search, removed content and unavailable controls.
- Duplicate names, repeated buttons, hidden menus, overlay background and disabled controls.
- Slow network, provider timeout, missing provider configuration and one denied microphone permission.
- Duplicate transcript delivery, repeated user requests and recognizer interim/final transitions.
- A pending write followed by "cancel", "don't", a new target, or an expired "yes".
- Dates, station pairs, route modes, participant counts, recipient lists, empty required fields and invalid ordinals.
- Dictation of command words, correcting a draft and exiting dictation intentionally.
- Meet participant speech, assistant TTS echo and ordinary conversation near the microphone.
- Optional face and hand control after voice changes, including tracking-loss freeze and pause cancellation.

Test voice-focused capture with camera disabled. Separately test voice alongside camera capture to detect device contention and performance regression. This does not require pointing during the voice journeys.

## 22. Acceptance gates and metrics

These are proposed release thresholds, not measured performance claims.

| Gate | Required evidence |
| --- | --- |
| Deterministic correctness | All relevant parser, validation, dialogue, safety and adapter fixture tests pass |
| Spoken-command accuracy | At least 95% correct intended outcomes on the declared held-out spoken set per site |
| Voice-only workflow completion | At least 95% supported journeys complete without physical assistance after setup |
| Mutation safety | Zero unintended writes, wrong-target writes or duplicate mutations in qualification |
| Negative examples | No execution on negation, literal dictation or stale-confirmation cases |
| Context integrity | No action in a different tab/entity after request invalidation |
| Responsiveness | Proposed median under 2 seconds and p95 under 4 seconds from speech end to verified effect, excluding separately reported page loading |
| Feedback | Every failure and ambiguity has an actionable spoken response where eyes-free support is claimed |
| Conversation isolation | No unintended action from meeting participant speech or unrelated nearby conversation |
| Optional input regression | Existing face and hand smoke tests pass separately |

Publish counts with percentages. Three successful repetitions do not establish a reliable 95% rate. Distinguish command attempts from workflows, recognition errors from interpretation errors and fixture outcomes from live-site outcomes. Report p95 only with a useful sample size and document the latency sample count.

A serious wrong-target mutation blocks release regardless of aggregate accuracy. An unsupported P1 action does not block a declared P0 release if clearly reported, but an incomplete P0 journey does. Fixes require rerunning affected cases and shared cancellation/confirmation regression checks.

## 23. What the tester should do, in order

1. Check which adapter actions are actually implemented in the current build. Mark the remaining catalogue entries Not implemented.
2. Run local deterministic tests first. Resolve failures before using an account.
3. Open the six websites normally and record which controls the account/page actually exposes.
4. Use typed commands for each implemented P0 action to isolate execution problems.
5. Disable camera/dwell, reset the page, and run the voice-only journeys.
6. Repeat using held-out natural phrases. Record the transcript as well as the requested meaning.
7. Test ambiguity, negation, already-satisfied state, correction and cancellation before confirming writes.
8. Run only deliberate owned-account mutations. Restore the original state and record cleanup.
9. Run participant-speech isolation, slow-response and stale-context tests.
10. Test optional face/hand operation for regressions separately.
11. File reproducible bugs with expected entity/state, actual entity/state and whether typed input also failed.
12. Qualify support per workflow. Recheck affected live actions after significant site changes.

A useful first milestone is exact place and route search, station/date forms, and chat/email search and drafts. Meet device coexistence and confirmed sends need separate qualification. Guarded writes come after that machinery is dependable. All six remain in scope; this ordering makes failures easier to diagnose.

## Group B language and entity-resolution examples

Treat these as evaluation phrases, not an instruction to execute on a keyword match. Negative and literal cases must be tested for each matching action family.

| Meaning | Positive variants | Must not execute when |
| --- | --- | --- |
| Select chat | “Open my chat with Mira”; “find the test conversation” | Similar contacts exist without a choice, or the phrase is merely discussed |
| Send message | “Send this to the test chat”; “please send my draft” | In dictation, recipient changed, approval expired or content is only being quoted |
| Compose email | “Email the test address”; “write a new message to my other account” | Recipient is unknown, external or inferred from stale context |
| Reply | “Reply to this thread”; “answer the latest email” | Multiple messages/recipients make reply scope unclear |
| Meeting mute | “Mute my Meet microphone”; “turn off meeting audio input” | User says “mute Handsfree” or is dictating those words |
| Join meeting | “Join the 2 pm test call”; “open my design review” | More than one matching meeting exists or preview identity differs |
| Find job | “Look for data analyst jobs in Bengaluru”; “search remote roles” | Terms are literal dictated content or location suggestion is uncommitted |
| Save job | “Save this role”; “keep this job for later” | No selected job, role changed, or target already saved (then no-op) |
| Find train | “Search Chennai to Bengaluru next Friday”; “find trains from MAS to SBC” | Date/year is ambiguous, station codes mismatch or required field is empty |
| Route mode | “Show walking directions”; “switch to public transport” | Place endpoints are unresolved or mode is unavailable for this route |
| Map zoom | “Zoom the map in”; “make the map closer” | User means browser page zoom and map context is not active |

For Hindi/Hinglish support, author separate station, contact-name and route phrases using the intended recognition language. Preserve proper nouns and station codes. Do not claim multilingual support because only the language model accepted a translated command; recognition, target resolution, confirmation and spoken feedback all need evidence.

## Group B completion matrix

| Site | P0 completion evidence | Explicit boundary |
| --- | --- | --- |
| WhatsApp Web | Correct chat, scoped read, literal draft, canceled and exactly-once test send | No contact discovery beyond account data, attachments, calls or destructive deletion |
| Gmail | Exact thread, distinct recipient/subject/body fields, canceled and exactly-once owned send | No credentials, OTPs, external recipients or attachments |
| Google Meet | Correct meeting, device state transitions, chat confirmation and participant-speech isolation | No end-for-everyone, recording, unknown admission or browser picker automation |
| LinkedIn | Search, verified filters/details, reversible save state | No submitted applications, bulk outreach or silent employer-domain handoff |
| IRCTC | Exact stations/date/options, verified train and availability results | Assisted authentication; no passenger booking, payment or cancellation |
| Google Maps | Exact place, verified endpoints/mode and route alternative | Desktop route planning only; no live turn-by-turn or implicit location permission |

## Group B specific risk gates

- Messaging/email: zero wrong-recipient sends, duplicate sends or stale drafts after chat/window changes. Draft text remains literal until the reserved dictation exit phrase.
- Meet: camera and microphone ownership is tested in both startup orders. A muted meeting microphone must not mute Handsfree input. Command-like speech from another participant must not cause an action.
- LinkedIn: job-save state must be verified against exact job identity. Application redirects are recorded as separate domains and no application is submitted.
- IRCTC: station codes and the full travel date are rechecked immediately before search. Authentication, CAPTCHA and OTP are assisted boundaries. Booking/payment controls are rejected.
- Maps: endpoints and travel mode are verified after each route recomputation. Desktop route display is not evidence of live navigation support.

## Group B implementation work packages

1. Add Group B domain IDs, finite action lists, safe result states and capability reports; retain generic browser controls.
2. Build entity/context primitives for chat, thread, meeting, job, station pair, train result, place and route. Invalidate them on tab change, internal navigation, rerender or form edit.
3. Implement read-only search/navigation for WhatsApp, Gmail, LinkedIn, IRCTC and Maps. Add duplicate-name fixtures before account workflows.
4. Add editor binding and dictated drafts for WhatsApp/Gmail, then confirmation, cancellation and exactly-once postcondition checks.
5. Qualify Meet device coexistence and conversation isolation before describing voice control during calls.
6. Add reversible LinkedIn save state and IRCTC search-form validation. Keep ticket booking excluded.
7. Verify Maps place/directions route outcomes; mark pan, navigation, Street View and unsupported modes unavailable.
8. Run fixture, typed-command, spoken and live-account qualification separately. Publish support by action and domain, with assisted steps explicit.

## 24. Support statement template

For each site, publish its domain, supported workflows/action IDs, tested date, extension build, Chrome/OS, UI language, recognition languages, account requirements, voice-only result counts, latency sample counts, known limitations and excluded actions.

Example wording for a future verified release: “Gmail: search, thread navigation, draft composition and confirmed sending to owned test recipients were tested on the listed build. Attachments and external recipients are not supported.” Use actual evidence before publishing the statement.

Do not describe planned catalogue coverage as shipped functionality. Do not describe an assisted CAPTCHA/OTP step as voice-only IRCTC support. Do not describe fixture results as successful live email, chat, booking or meeting behavior.

## 25. Decisions fixed by this plan

- The first six Group B sites are WhatsApp Web, Gmail, Google Meet, LinkedIn, IRCTC and Google Maps.
- Website workflows prioritize natural spoken language and work without pointer positioning.
- Face and hand remain optional and receive regression coverage.
- Site context determines what “send”, “reply”, “join”, “save”, “next” and “this” mean.
- Ordinary commands retain bounded Jev classification; broader requests retain the existing explicit wake route.
- Application code controls action whitelists, target validation, confirmations and transaction exclusions.
- Desired-state changes must not toggle or duplicate on repeated commands.
- Message/email sends and account mutations require voice confirmation; IRCTC booking remains excluded.
- No live bookings/payments, meeting termination for everyone, bulk outreach, account deletion or unbounded generated-code execution is included.
- Voice-only support is a measured workflow claim, with explicit setup and browser limitations.
- Implementation, hardware testing and live-site qualification are still required after this planning task.
