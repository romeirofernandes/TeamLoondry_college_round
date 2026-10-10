# Group A voice-first website support plan

Prepared 2026-10-10. This document specifies proposed implementation and testing. It does not claim that these commands already work or that live websites have passed tests.

## 1. Outcome and scope

Handsfree should let a person complete supported website workflows by speaking naturally. The person should not need to move a pointer, position their face, gesture at a control, or know the website's keyboard shortcuts. Face and hand control remain available as optional ways to interact. Their presence must not hide gaps in voice support.

Group A contains exactly these six websites:

| Site | Initial scope | Main voice workflows |
| --- | --- | --- |
| Wikipedia | English Wikipedia, desktop article and search pages | Search, read, navigate sections, follow references and links |
| GitHub | Desktop github.com, public reading and an owned private test repository | Find repositories, inspect files, navigate issues, draft and deliberately submit test content |
| Reddit | Desktop reddit.com, public reading and an owned test space | Search, browse, navigate comments, vote and manage owned drafts |
| Amazon | Desktop amazon.in, English UI | Search, filter, inspect products, select variants, deliberately manage a test cart |
| Spotify | Desktop open.spotify.com | Search, play, navigate tracks, control the player, manage saved music where available |
| Netflix | Desktop netflix.com with an existing subscription | Find titles, control playback, choose episodes, change available audio/subtitle settings and rate titles |

WhatsApp, Gmail, Meet, LinkedIn, IRCTC and Maps remain Group B. YouTube is not one of these six. The phrase "like the video" is a natural-language test case, not permission to silently add another website. On Netflix it may mean the current title's positive rating. On a Reddit video post it may mean upvoting that post. On an unsupported video website Handsfree must say that the requested action is unavailable.

"Almost native" means a tested set of direct commands that understand the site's objects and report verified results. It does not mean full control of every feature on a third-party website.

### Release rules

- A supported journey must work with microphone input alone after initial installation, permissions and account setup.
- Voice selection must resolve named objects without requiring pointer location.
- A command must describe the intended state. "Like this" should leave it liked, including when it was already liked.
- Missing controls, account restrictions and uncertain targets must produce an explanation or a spoken clarification.
- Listening, transcription, interpretation, execution and verification need distinct failure messages.
- Do not publish a blanket "supports Netflix" claim. Publish named, dated, tested workflows and their account/browser requirements.
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
| Available | The adapter can resolve and execute the action now | "Opening the History section." |
| Needs choice | Several grounded targets fit | "Do you mean the song by Artist A or Artist B?" |
| Needs confirmation | The action changes account data or publishes content | "Post this reply to the selected thread?" |
| Unavailable here | The site/page/account lacks the control | "Seeking is unavailable in this player right now." |
| Not implemented | The adapter has no supported execution path | "Playlist editing is not supported in this version." |
| Failed | The action was attempted but its result was not verified | "I could not verify that the item was added. I won't add it again automatically." |
| Already satisfied | The requested state already exists | "That track is already saved." |

The adapter must never translate unavailable actions into a vaguely similar write. "Like this" must not post a comment saying "like".

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
| Open site | "Open Wikipedia", "take me to Spotify" | Open the configured domain and announce the destination |
| Select tab | "Switch to Netflix", "go back to the GitHub tab" | Resolve the tab by site/title; ask if several match |
| Browser back/forward | "Go back a page", "browser forward" | Browser history navigation, not previous track or section |
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

Plain "pause" on an active media page should pause media when that scope is clear. "Pause Handsfree" always controls Handsfree. Plain "stop" should stop pending work and ask what to stop if media and session meanings conflict. Do not change existing behavior silently; specify and test migration behavior.

## 5. Natural-language understanding

### Meaning before exact wording

The same intent should accept terse, polite and conversational phrasing:

| Meaning | Test variants |
| --- | --- |
| Positive reaction | "Like this", "like the video", "give this a thumbs up", "I want to like this post", "mark this as liked" |
| Media pause | "Pause the song", "hold the music", "stop playing for a moment", "pause this episode" |
| Next track | "Next song", "skip this track", "play the next one", "move to the following track" |
| Search | "Search Wikipedia for black holes", "find an article about black holes", "look up black holes here" |
| Open result | "Open the second result", "the second one please", "choose number two" |
| Seek | "Go forward thirty seconds", "skip half a minute", "jump to two minutes ten" |
| Explicit correction | "Actually, choose the third one", "no, I meant the album", "make that forty percent" |
| Cancellation | "Never mind", "cancel it", "don't do that", "leave it as it is" |

These are evaluation examples. They are not a license to act whenever the recognizer hears a related word. "I like this song's lyrics" may be commentary. "Do not like this video" must not cause a positive reaction. "Write 'like the video' in the comment" is dictation. "How do I like a video?" asks for help.

Support proposed Hinglish variants deliberately, including "yeh video like karo", "gaana pause karo", "agla gaana chalao", "second wala kholo" and "isko mat bhejo". Preserve names and titles in their original script. Do not claim Hindi or Hinglish support until recognition, interpretation and dialogue have all passed that language's tests. English UI selectors and Hindi speech are separate test dimensions.

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

Do not let a generic "next" rule swallow "next episode" before the domain adapter sees it. Do not let an ordinary-command cloud call block urgent pause. Preserve existing cancellation and request timeouts.

### Jev and slot extraction

Jev should select among a bounded list such as `spotify.pause`, `spotify.nextTrack`, `spotify.saveTrack`, `clarify`, `help`, `none`. Candidate generation happens in application code. Include the current domain, object type and available capabilities, without shipping the whole page.

Time, percentage and ordinal parsers should run locally. Search strings and dictated text need bounded extraction from the user's utterance. For known patterns, extract the actual span rather than inventing text. For uncertain title boundaries, offer candidate title spans or ask the user to repeat the title separately. Use Groq structured extraction only on the existing broader request route, with schema validation and the same action whitelist. Never assume Jev will emit arbitrary generated JSON strings.

Classifier confidence alone is insufficient. Execution also requires a valid action, a grounded target and a supported state. Select thresholds from validation data separately for read actions and writes. A low-confidence write must ask or decline.

### Context and references

Maintain context per tab and document revision:

- Active site, page type and player state.
- Current article/repository/product/post/title/track with stable IDs where available.
- Voice-selected entity and its type.
- Most recent spoken choices, their order and source revision.
- Pending clarification or confirmation with an expiry.
- Last verified action, its result and any supported inverse.

"This" refers to the voice-selected item or unambiguous current entity. It never requires camera direction. If a page contains several posts, "like this" asks which post unless the user selected one. "The second one" uses the list most recently announced by Handsfree, not an unspoken list inferred from a changing page.

Expire choices after relevant navigation, rerender, filtering or tab change. Before executing a pending request, resolve the entity again. A matching label alone does not establish that it is the same product, comment or file.

### Multi-step speech

Accept "search for headphones, filter under two thousand rupees, then show the best-rated ones" as a proposed bounded plan of supported read actions. Announce the steps, run them sequentially and verify each. If a step needs clarification, stop the sequence there.

A mixed request such as "find this product and add it to my cart" stops for confirmation at the write. Do not keep executing later steps after a failed step. "Cancel" cancels the remaining plan. Report completed changes separately; cancellation cannot reverse everything automatically.

## 6. Execution design

Create proposed modules under `extension/src/sites/`: `registry.ts`, `types.ts`, `context.ts`, `resolver.ts`, `executor.ts`, plus `wikipedia.ts`, `github.ts`, `reddit.ts`, `amazon.ts`, `spotify.ts` and `netflix.ts`. These paths are design proposals, not existing files.

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

Entity references should include site identity and object type. A product title, a song title and a Netflix title can have identical text. They must not be interchangeable. Attach scope such as repository owner/path, post/comment ID, product/variant identity or current track artist.

### Target resolution strategy

Prefer semantic roles, accessible names, labels, relationships and stable visible link destinations. Scope lookups to the current editor, player, post, product panel or modal. Use site-specific selectors only where necessary and document what page variant each selector supports.

Exclude hidden, disabled, background-modal and detached controls. Recheck enabled state immediately before activation. Treat DOM mutation and SPA navigation as invalidation events. Never select an offscreen duplicate simply because it appears first in DOM order.

Use page-supported inputs/events and test that actual site handlers respond. Setting an input's `value` without updating a controlled editor is insufficient. Synthetic keyboard events may not behave like real trusted input. Do not claim a shortcut works merely because an event was dispatched.

Fullscreen needs special investigation because `requestFullscreen()` normally requires transient user activation. A recognized voice command and a synthetic click do not automatically supply it. Only claim voice-only fullscreen where the tested interaction genuinely works; otherwise announce its limitation. [MDN fullscreen requirements](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)

### Verification examples

| Action | Required evidence |
| --- | --- |
| Open article/file/post | Current entity identity or verified destination |
| Set filter/sort | Selected control state and refreshed result context |
| Save/like/star | Desired pressed/saved/rated state associated with the correct entity |
| Pause playback | Actual player pause state, not just a button animation |
| Seek | Observed playback time near requested time within a documented tolerance |
| Add cart item | Correct product, variant and quantity in cart, without an extra addition |
| Submit issue/comment | Exactly one created object with expected ownership/content in the test space |
| Change subtitles | Actual selected subtitle state and playback continuity |

A timeout produces an uncertain result, not success. Read operations may retry after rebuilding context. Mutations must not retry automatically when the first outcome is unknown.

## 7. Confirmation, writes and undo

Use one policy across adapters. Do not delegate confirmation decisions to the language model.

P0 policy: account mutations require a spoken preview and explicit voice confirmation. This includes likes, votes, stars, saved tracks, ratings, follows, playlist edits, cart changes and submissions. Once reliability is proven, an explicitly configured reduced-confirmation preference may be considered for reversible reactions. It is outside the initial release.

A confirmation is bound to the exact action, entity, desired state, arguments, tab and document revision. "Yes" resolves only one current pending request. Reject an expired confirmation and announce why. Cancel it on navigation, relevant entity change, hard pause or a new incompatible request.

For "like the video", say what that means on the site. Examples: "Upvote the selected Reddit post?" or "Give this Netflix title a thumbs up for the current profile?" The user can answer "confirm", "no", or correct the target.

Do not expose live Amazon purchase completion in this release. Buy now, checkout completion, orders, payment, subscription changes, GitHub merges/deletes and account deletion are outside the supported command set. Test their rejection with local fixtures. Do not click a live purchase control to discover whether a guard works.

Undo is action-specific. Removing a star or restoring a prior vote is possible only if the previous state was known and the same object is still available. Browser back is navigation, not undo. Deleted content or a sent notification may not be recoverable. Tell the user which inverse is available and confirm it when required.

## 8. Dictation and editing without pointing

Every editor workflow needs voice field selection. "Write the issue title" must locate the title field in the current issue form. "Write the reply" must select the correct comment editor. A generic "start typing" into an unknown focused control does not count as native support.

Proposed editor commands:

| Command | Behavior |
| --- | --- |
| "Write the title" | Select the scoped title field and begin literal dictation |
| "Write the description/reply" | Resolve the correct body editor and begin literal dictation |
| "Finish dictation" | Leave literal mode and return to command mode |
| "Read back the draft" | Read the scoped draft if speech output is implemented |
| "Replace the last sentence with ..." | Show/read the proposed edit; change only a resolved text range |
| "Delete the last word" | Edit the active draft using a verified caret or tracked insertion range |
| "Select the title field" | Focus by semantic field name without pointer input |
| "Clear this draft" | Confirm clearing the identified draft |
| "Preview this reply" | Open the available preview without publishing |
| "Submit the issue/reply" | Announce destination and content summary, then await confirmation |

Use a deliberately reserved exit phrase with a documented way to dictate that phrase literally. Test dictation containing "scroll down", "send", "like this", "cancel" and quoted commands. These words must remain text while literal mode is active, except for an explicitly documented emergency stop.

Never send passwords, OTPs or payment fields to the classification provider. Refuse dictation into protected fields if the speech pipeline cannot meet the required privacy boundary. Do not announce sensitive values aloud. Ordinary page metadata should be minimized before cloud classification.

Speech output is a proposed requirement for complete eyes-free choices and errors. The current visual transcript is not proof of spoken feedback. Build and test TTS separately, including interrupt, volume, microphone echo and no repeated acknowledgments. Avoid feeding the assistant's own voice back into execution.

## 9. Wikipedia command catalogue

Initial adapter targets English Wikipedia search, disambiguation and article pages. Editing, account management and publishing changes are outside the initial supported set.

| ID | Priority | Voice examples | Resolution and verified outcome |
| --- | --- | --- | --- |
| W01 | P0 | "Search Wikipedia for India", "look up India" | Extract query and verify search/article destination |
| W02 | P0 | "Open the first search result", "choose result two" | Resolve announced search candidate and article identity |
| W03 | P0 | "Choose the planet", "I mean Mercury the element" | Choose a grounded disambiguation entry |
| W04 | P0 | "Open the History section", "take me to Geography" | Match current article heading and verify viewport |
| W05 | P0 | "List the sections", "what headings are here?" | Announce a bounded ordered section list |
| W06 | P0 | "Next section", "previous heading" | Move relative to current section, report its title |
| W07 | P0 | "Go to the introduction", "start of the article" | Navigate to article introduction |
| W08 | P0 | "Open the link called Solar System" | Resolve an article-body link, clarify duplicate destinations |
| W09 | P0 | "Open that link in a new tab" | Use the voice-selected link and verify new tab identity |
| W10 | P0 | "Show reference five", "open citation number five" | Resolve citation number in the current article |
| W11 | P0 | "Back to the sentence", "return from the reference" | Return to the tracked citation origin |
| W12 | P0 | "Find climate in this article" | Locate text locally and announce match count |
| W13 | P0 | "Next match", "previous occurrence" | Move within the current find query |
| W14 | P0 | "Show the contents", "expand the table of contents" | Use an available contents control or announce sections |
| W15 | P1 | "Expand this section", "collapse the History section" | Change supported collapsible heading state |
| W16 | P1 | "Show the infobox", "go to the facts box" | Navigate to the current article's infobox |
| W17 | P1 | "Open the image", "show the second article image" | Resolve article image excluding icons and decorations |
| W18 | P1 | "Close the image viewer" | Close active media modal and restore article context |
| W19 | P1 | "Show references", "go to external links" | Match actual section, report absent sections |
| W20 | P1 | "Switch this article to Hindi" | Follow an available language link, invalidate English-only assumptions |
| W21 | P1 | "Read this paragraph", "read from this heading" | Requires new TTS and resolved visible article text |
| W22 | P1 | "Stop reading", "continue reading" | Control reader independently of Handsfree listening |
| W23 | P2 | "Hey Handsfree, summarize this section" | Grounded broader answer using selected section, never Jev text generation |
| W24 | P2 | "Hey Handsfree, explain this sentence" | Explicitly selected text and bounded grounded response |

Wikipedia acceptance must include repeated links, missing headings, a long article, disambiguation, citation return, article changes and text at 200% zoom. Reading aloud and summaries get separate support labels until implemented.

## 10. GitHub command catalogue

Read workflows work on public repositories. Write workflows use an owned private test repository. Resolve owner/repository/branch/path explicitly. A README mention of "Issues" must not steal the repository Issues command.

| ID | Priority | Voice examples | Resolution and verified outcome |
| --- | --- | --- | --- |
| G01 | P0 | "Search GitHub for accessible browser extensions" | Verify site search query and result category |
| G02 | P0 | "Show repository results", "search only issues" | Set available result type and verify selected category |
| G03 | P0 | "Open owner slash repository", "open the second repository" | Resolve exact repository identity |
| G04 | P0 | "Show the README", "go to repository overview" | Open repository main view/README |
| G05 | P0 | "Open the src folder" | Resolve directory within current branch/path |
| G06 | P0 | "Open package dot json", "open src slash index dot ts" | Match full file path; clarify repeated filenames |
| G07 | P0 | "Go up one folder" | Navigate repository path parent, not browser history |
| G08 | P0 | "Find a file named parser" | Use supported file finder and announce candidates |
| G09 | P0 | "Switch to the main branch" | Resolve actual branch and verify displayed branch |
| G10 | P0 | "Open Issues", "show pull requests" | Scoped repository navigation |
| G11 | P0 | "Search issues for voice", "show open issues" | Apply query/status and verify results |
| G12 | P0 | "Open issue forty-two" | Resolve issue number in current repository |
| G13 | P0 | "Open pull request twelve" | Resolve PR identity; no merge action |
| G14 | P0 | "Show the changed files", "open the conversation" | Navigate current PR tabs |
| G15 | P0 | "Star this repository", "like this repo" | Confirm desired starred state of current repository |
| G16 | P0 | "Remove my star", "unstar this repository" | Confirm desired unstarred state |
| G17 | P1 | "Show commits", "open the latest commit" | Resolve commit list and selected commit |
| G18 | P1 | "Show releases", "open the latest release" | Resolve release identity; downloads separate |
| G19 | P1 | "Go to line forty", "show line one hundred" | Parse bounded line number and verify available file line |
| G20 | P1 | "Expand this diff", "show more context" | Resolve file/hunk when supported; clarify multiple hunks |
| G21 | P1 | "Create a new issue draft" | Open new issue form, handle templates by spoken choice |
| G22 | P1 | "Write the issue title", "write the issue body" | Select scoped field and begin literal dictation |
| G23 | P1 | "Preview the issue", "show edit mode" | Switch available editor mode |
| G24 | P1 | "Submit this issue" | Confirm destination and draft; verify one created test issue |
| G25 | P1 | "Reply to this issue", "write a comment" | Resolve current issue's editor, preserve text literally |
| G26 | P1 | "Post the comment" | Confirm and verify exactly one owned test comment |
| G27 | P1 | "Give this comment a thumbs up" | Resolve selected comment reaction, not repository star |
| G28 | P1 | "Close my test issue", "reopen this issue" | Confirm permission-bound issue state change |
| G29 | P2 | "Watch this repository", "stop watching it" | Confirm subscription choice and verify actual state |
| G30 | P2 | "Copy the file path" | Clipboard action only where permission/activation works; report limitation |

"Like this" is a repository star only when repository context is unambiguous. On a selected comment it can mean an available positive reaction. Ask when both fit. No automated merges, pushes, repository deletion, secrets editing or deployment in this adapter's initial scope.

## 11. Reddit command catalogue

Treat posts and comments as different entity types. Support only declared Reddit UI variants. Infinite feeds, overlays and collapsed threads make stale context a frequent risk.

| ID | Priority | Voice examples | Resolution and verified outcome |
| --- | --- | --- | --- |
| R01 | P0 | "Search Reddit for mechanical keyboards" | Verify query and search page |
| R02 | P0 | "Search within this community for voice control" | Scope query to current community |
| R03 | P0 | "Open r slash accessibility" | Resolve community destination |
| R04 | P0 | "Open the second post", "open the post about keyboards" | Announced feed entity and destination |
| R05 | P0 | "Next post", "previous post" | Change voice-selected feed entity; announce title before reactions |
| R06 | P0 | "Show comments", "open the discussion" | Open comments for selected/current post |
| R07 | P0 | "Sort posts by new", "show top posts this week" | Verify sort and available time range |
| R08 | P0 | "Sort comments by best", "show newest comments" | Verify comment-specific sorting |
| R09 | P0 | "Expand this thread", "show the replies to comment two" | Resolve comment and expanded child state |
| R10 | P0 | "Collapse this comment thread" | Collapse selected thread only |
| R11 | P0 | "Next comment", "go to the parent comment" | Update comment context and announce excerpt |
| R12 | P0 | "Like this post", "upvote the video" | Confirm upvoted state of selected post |
| R13 | P0 | "Downvote this post", "give it a downvote" | Confirm desired vote; distinguish from remove upvote |
| R14 | P0 | "Remove my vote", "undo that upvote" | Confirm neutral vote state or tracked inverse |
| R15 | P0 | "Upvote this comment" | Confirm vote on selected comment, never adjacent post |
| R16 | P0 | "Close this post", "return to the feed" | Close active overlay or navigate to tracked feed |
| R17 | P1 | "Save this post", "unsave it" | Confirm desired account save state |
| R18 | P1 | "Hide this post" | Confirm hide action; report effects on current context |
| R19 | P1 | "Join this community", "leave this community" | Confirm membership change |
| R20 | P1 | "Reply to comment two", "write a reply to this post" | Resolve correct editor and recipient/thread |
| R21 | P1 | "Write the reply", "finish dictation" | Scoped literal editor workflow |
| R22 | P1 | "Post this reply" | Confirm target/content; verify one owned test reply |
| R23 | P1 | "Discard this reply" | Confirm removal of current draft |
| R24 | P1 | "Play this post's video", "pause the video" | Resolve selected post's player and actual playback |
| R25 | P1 | "Mute this video", "unmute it" | Desired state on scoped video player |
| R26 | P1 | "Show spoiler text" | Reveal specifically selected spoiler where supported |
| R27 | P2 | "Edit my comment" | Ownership check, select editor, confirm eventual publication |
| R28 | P2 | "Hey Handsfree, summarize these comments" | Bounded visible thread context, no invented unseen replies |

Do not include moderation, reporting, deletion or mass voting in the first release. A signed-out reaction should explain the login requirement rather than navigating through authentication automatically.

## 12. Amazon India command catalogue

Limit the initial adapter to amazon.in and state this in support claims. Filters and product variants differ by category. Result numbering must distinguish sponsored placements and the list actually announced.

| ID | Priority | Voice examples | Resolution and verified outcome |
| --- | --- | --- | --- |
| A01 | P0 | "Search Amazon for wireless headphones" | Query and results destination |
| A02 | P0 | "Show the second product", "open the Sony headphones" | Resolve announced product identity and seller context |
| A03 | P0 | "Only show items under two thousand rupees" | Parse INR bound and verify available price filter |
| A04 | P0 | "Between one thousand and three thousand" | Validate lower/upper range before applying |
| A05 | P0 | "Filter by Logitech", "show the Samsung brand" | Match available brand filter |
| A06 | P0 | "Sort by lowest price", "sort by customer rating" | Match actual sort option and verify selection |
| A07 | P0 | "Clear the price filter", "remove all filters" | Clear specified supported filters and refresh context |
| A08 | P0 | "Choose black", "select size medium" | Resolve product-specific variant and updated identity |
| A09 | P0 | "Choose the 128 GB version" | Resolve capacity option without guessing equivalents |
| A10 | P0 | "What variant is selected?" | Report selected visible variant, availability and current displayed price |
| A11 | P0 | "Show product details", "go to specifications" | Navigate actual section |
| A12 | P0 | "Show customer reviews" | Open current product reviews section/page |
| A13 | P0 | "Show one-star reviews", "sort reviews by recent" | Apply available review filters and verify state |
| A14 | P0 | "Show the next product image" | Advance current product gallery, exclude ad images |
| A15 | P0 | "Close image zoom" | Close active product media overlay |
| A16 | P0 | "Go back to search results" | Restore tracked results context and rebuild candidates |
| A17 | P1 | "Add one of these to my cart" | Confirm product, variant, seller, quantity and displayed price; verify cart |
| A18 | P1 | "Open my cart" | Navigate cart without checkout |
| A19 | P1 | "Set this item's quantity to two" | Confirm exact cart row and desired quantity |
| A20 | P1 | "Remove the headphones from my cart" | Clarify duplicates, confirm and verify exact row removal |
| A21 | P1 | "Save this cart item for later" | Confirm desired cart/save-for-later state |
| A22 | P1 | "Add this to my wishlist", "like this product" | Confirm list/item where wishlist UI exists |
| A23 | P1 | "Remove this from my wishlist" | Confirm exact list entry and final state |
| A24 | P1 | "Show delivery information" | Read displayed information only; no invented delivery promise |
| A25 | P1 | "Show other sellers" | Open available seller choices and announce identities |
| A26 | P2 | "Hey Handsfree, compare these two products" | Compare selected visible product facts, disclose missing facts |
| A27 | P2 | "Show questions about battery life" | Only if the current site exposes a supported question/search control |
| A28 | P2 | "Read this review" | Requires TTS; scope to selected review |

"Like this product" means a proposed wishlist operation when supported. It never means submitting a product review or rating. Existing cart items require row identity, not just name matching. Out-of-stock or unresolved variants must stop cart preparation. All live purchase completion remains excluded.

## 13. Spotify Web command catalogue

Record account tier and country because controls and playback restrictions vary. A track title needs artist context. A result can be a song, album, artist, podcast or playlist; resolve that type explicitly.

| ID | Priority | Voice examples | Resolution and verified outcome |
| --- | --- | --- | --- |
| S01 | P0 | "Search Spotify for Radiohead" | Verify query and result view |
| S02 | P0 | "Show songs", "show albums", "show playlists" | Set available result type |
| S03 | P0 | "Play Creep by Radiohead" | Match track and artist; verify actual track/player state |
| S04 | P0 | "Open the album OK Computer" | Resolve album, clarify artist if necessary |
| S05 | P0 | "Play this playlist", "start the album" | Resolve current entity and account-supported playback |
| S06 | P0 | "Pause the song", "hold the music" | Pause actual player, keep Handsfree active |
| S07 | P0 | "Resume the music", "continue playing" | Resume player if available |
| S08 | P0 | "Next track", "skip this song" | Verify changed track or announce restriction |
| S09 | P0 | "Previous track", "restart this song" | Distinguish previous from restart using supported player behavior |
| S10 | P0 | "Mute Spotify", "unmute the player" | Desired player mute state |
| S11 | P0 | "Set volume to forty percent" | Parse and verify player volume; not OS volume |
| S12 | P0 | "Turn it up a little", "lower volume ten percent" | Document step size and clamp bounds |
| S13 | P0 | "Go forward thirty seconds" | Seek relative to current position if available |
| S14 | P0 | "Jump to two minutes ten" | Parse absolute time, validate duration and verify position |
| S15 | P0 | "What song is playing?" | Read current track and artist from player |
| S16 | P0 | "Like this song", "save the current track" | Confirm desired saved state through current UI |
| S17 | P0 | "Remove this from liked songs" | Confirm desired unsaved state |
| S18 | P1 | "Show my library", "open liked songs" | Navigate available library destination |
| S19 | P1 | "Show the queue" | Open queue panel and establish numbered candidates |
| S20 | P1 | "Add this song to the queue" | Confirm entity and queue action; verify once |
| S21 | P1 | "Remove the second queued song" | Confirm queue-entry identity, not duplicate track elsewhere |
| S22 | P1 | "Turn shuffle on", "turn shuffle off" | Desired shuffle state, reject unavailable tier control |
| S23 | P1 | "Repeat this track", "repeat this playlist", "turn repeat off" | Resolve supported repeat state explicitly |
| S24 | P1 | "Follow this artist", "unfollow this artist" | Confirm desired account follow state |
| S25 | P1 | "Save this album", "save this playlist" | Use available library semantics and verify |
| S26 | P1 | "Add this track to my Study playlist" | Resolve owned playlist, confirm and verify membership |
| S27 | P1 | "Show lyrics", "close lyrics" | Navigate available lyrics panel; missing lyrics explained |
| S28 | P2 | "Create a playlist called Study" | Confirm title and owned new playlist; no duplicate retry |
| S29 | P2 | "Play the latest episode of this podcast" | Grounded podcast/episode identity and account support |
| S30 | P2 | "Change playback speed to one point five" | Podcast-specific supported speed, unavailable for music explained |

Spotify documents web-player keyboard shortcuts, which can guide investigation. Each adapter action still needs verification through the actual page, since dispatched synthetic shortcuts may not trigger the same behavior. [Spotify keyboard shortcuts](https://support.spotify.com/in-en/article/keyboard-shortcuts/)

## 14. Netflix command catalogue

Use real Chrome with an existing subscription for playback tests. A headless fixture cannot establish DRM playback support. Profile-specific ratings, title availability and episode controls must be grounded in the actual account's UI.

| ID | Priority | Voice examples | Resolution and verified outcome |
| --- | --- | --- | --- |
| N01 | P0 | "Open the profile named Test" | Select explicit available profile; ask if ambiguous |
| N02 | P0 | "Search Netflix for Stranger Things" | Verify query and actual results |
| N03 | P0 | "Open the second title", "show this film's details" | Resolve title identity and details panel |
| N04 | P0 | "Play this title", "start the episode" | Verify title/episode and actual playback |
| N05 | P0 | "Continue watching this show" | Resolve matching Continue Watching item |
| N06 | P0 | "Pause the video", "pause this episode" | Pause player, keep Handsfree listening |
| N07 | P0 | "Resume the episode", "continue playing" | Verify player resumes |
| N08 | P0 | "Go forward ten seconds", "rewind thirty seconds" | Verify bounded relative seek |
| N09 | P0 | "Go to five minutes" | Absolute seek only if a reliable supported path exists |
| N10 | P0 | "Mute Netflix", "unmute this video" | Desired player mute state |
| N11 | P0 | "Set player volume to fifty percent" | Set supported player volume, not system volume |
| N12 | P0 | "What am I watching?" | Announce visible title/episode context |
| N13 | P0 | "Like this video", "give this title a thumbs up" | Confirm current profile's positive title rating |
| N14 | P0 | "Remove my rating" | Confirm removal only where actual UI supports it |
| N15 | P0 | "Close the details", "back to browsing" | Close relevant panel or leave player through supported control |
| N16 | P1 | "Show episodes", "open the episode list" | Open current series episode list |
| N17 | P1 | "Choose season two" | Match available season and refresh episode choices |
| N18 | P1 | "Play episode three" | Resolve series/season/episode identity before play |
| N19 | P1 | "Next episode" | Use available episode control; distinguish from title carousel |
| N20 | P1 | "Skip intro" | Use currently available control, otherwise explain absence |
| N21 | P1 | "Skip recap" | Use available recap control without arbitrary seeking |
| N22 | P1 | "Turn on English subtitles" | Match actual subtitle option and verify selection |
| N23 | P1 | "Turn subtitles off" | Desired off state |
| N24 | P1 | "Switch audio to Hindi" | Select available audio track; do not substitute subtitles |
| N25 | P1 | "Show audio and subtitles" | Open player menu and announce actual options |
| N26 | P1 | "Go fullscreen", "leave fullscreen" | Claim only after real voice-only browser verification |
| N27 | P1 | "Add this to My List", "remove it from My List" | Confirm desired profile list state |
| N28 | P1 | "Give this two thumbs up" | Confirm only if the exact rating control exists |
| N29 | P1 | "Dislike this title", "give it a thumbs down" | Confirm profile-specific negative rating |
| N30 | P2 | "Change playback speed" | Offer only currently available speed choices |

Netflix's documented player shortcuts include pause, seeking, volume and fullscreen controls. They establish intended player functions, not proof that the extension can invoke them through voice. Test each supported interaction in the real player. [Netflix player shortcuts](https://help.netflix.com/en/node/24855)

Never claim every title has every language, intro, recap or rating control. Hidden player controls must be revealed through a supported interaction. Repeated "like this" requests must not alternate the rating.

## 15. Ambiguity and failure catalogue

| Situation | Expected behavior |
| --- | --- |
| "Like this" with no selected entity | Ask what to like; perform no write |
| Two songs with the same title | Announce artists and ask a numbered choice |
| Two Amazon variants named black | Include size/capacity/product context in the choice |
| "Next" on Netflix browse page | Ask title versus episode if both fit |
| "Pause" while dictating | Keep literal dictation unless explicitly addressed as a control |
| "Don't post it" | Cancel pending publication; no submit |
| "Actually the third one" before execution | Replace pending selection and invalidate old confirmation |
| Tab switched during provider request | Cancel/revalidate according to request binding; no action in a different tab |
| Player ad or account restriction | Explain unavailable control, no invented bypass |
| Network disconnected | Distinguish provider failure from page failure; no stale queued action |
| Permission denied | Explain missing permission without repeatedly prompting |
| UI changed unexpectedly | Mark adapter action unavailable/failed and retain generic navigation help |
| Outcome of write uncertain | Report uncertainty, inspect current state, never blind retry |
| Assistant speech heard by microphone | No new site action from self-generated feedback |
| Website audio contains "like this" | No unintended reaction; test interference controls and listening policy |
| Browser-native dialog appears | Explain boundary and record assistance if needed |

A practical voice interface needs short questions. "Which song: one, Creep by Radiohead; or two, Creep by TLC?" is useful. Reading dozens of results is not. Announce up to five candidates per batch and support "more choices".

## 16. Implementation work packages

### Package 1: Baseline and scope contract

Inspect current parser, provider routing, safety guards, dictation, cancellation and media lifecycle. Record existing tests and known regressions. Define site IDs, action IDs, support states and P0 journeys from this document. Decide exact allowed hostnames and no-write fixture rules.

Completion: source-level baseline documented, six adapter contracts specified, no current behavior mislabeled as new support.

### Package 2: Shared voice dialogue

Implement tab-bound selection, clarification, confirmation and cancel state. Add request/revision binding and expired-choice handling. Add named-field dictation transitions and literal-mode collision tests. Build the voice-focused session lifecycle and feedback output if missing.

Completion: a local fixture completes search, choice, field selection, dictation, cancel and confirmed test write without pointing. Stop cancels pending provider work. Hard stop releases capture.

### Package 3: Natural-language routing

Add domain-aware candidates before generic shortcuts. Preserve deterministic local parsing and existing provider routes. Implement bounded slot extraction, negation, correction and unsupported/help results. Create held-out phrase sets before tuning.

Completion: ordinary paraphrases resolve through finite choices; Jev is never asked for arbitrary generated strings; broader output cannot bypass action validation.

### Package 4: Adapter infrastructure

Implement registry, context invalidation, semantic resolver, execution timeouts, desired-state mutations, evidence and capability reports. Build fixtures representing normal, missing, duplicate, disabled and stale controls.

Completion: all infrastructure tests pass, stale targets cause no action, unknown write outcomes never trigger automatic repetition.

### Package 5: Wikipedia and GitHub reading

Implement Wikipedia P0 and GitHub read-only P0 first. These expose search, navigation, entity types and ambiguity without needing a complex player. Add GitHub star with guarded fixture coverage before deliberate live test-account use.

Completion: three voice-only journeys per site pass; repeated titles and SPA navigation are covered.

### Package 6: Spotify and Netflix player control

Implement player inspection, actual state verification, pause/resume, next/seek where available and volume. Add account-aware capability reporting. Investigate fullscreen separately. Add reactions only after selected-entity context and confirmation are stable.

Completion: sustained real-browser audio tests pass without wrong media/session commands. DRM and tier restrictions are recorded rather than hidden by fixture results.

### Package 7: Reddit and Amazon reading

Implement Reddit feed/comment entity selection and Amazon result/variant/filter handling. Finish read-only journeys before cart or publishing work. Exercise infinite loading and sponsored-result numbering.

Completion: voice-only reading workflows pass with stale-list invalidation and no accidental writes.

### Package 8: Guarded account mutations and drafts

Implement declared reactions, saves, follows, test cart edits and owned draft publication. Centralize confirmation around custom site handlers, not only HTML forms. Add postcondition checks and cleanup instructions per action.

Completion: every mutation has positive, cancel, stale-confirmation, duplicate-command and uncertain-result coverage. Excluded transactions remain rejected.

### Package 9: Live qualification and regression

Run the protocols below, fix failures and rerun affected cases. Test face and hand separately for regressions. Publish support statements with measured outcomes and dates. Keep P1/P2 actions unavailable until their own evidence exists.

Completion: release gates pass per named workflow. One site's success does not qualify another.

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

Use representative local DOM fixtures, not copied private pages. Include repeated labels, nested comments, hidden modals, controlled text editors, delayed rerenders, virtualized lists, disabled controls, player restrictions and custom submission buttons. Record which live variant inspired each fixture without account data.

Tests should assert meaningful outcomes: the correct entity changes, the draft stays literal, the wrong object remains unchanged, and only one mutation occurs. Avoid tests that merely mirror a selector or assert that a handler was called.

## 18. Natural-language evaluation set

For each implemented P0 action, create at least ten positive phrases: four development phrases and six held-out phrases. Include terse commands, politeness, reordered words, object names, synonyms and corrections. Do not tune against the held-out set and still call it held out.

Create at least 200 shared negative/ambiguous examples across the six sites, covering commentary, questions, negation, dictation, unsupported action, wrong domain, duplicate entity, stale selection and background media speech. Balance these categories and record their counts.

For each reaction action, explicitly test:

1. "Like this."
2. "Like the video."
3. "Give it a thumbs up."
4. "Don't like it."
5. "How do I like this?"
6. "I like the way this looks."
7. "Write 'like this' in my reply."
8. "Like the second one", with and without a current choice list.
9. "Like this", when already liked.
10. "Like this", after navigation invalidated the selection.
11. "Actually, don't do that", while preparing confirmation.
12. "Confirm", after the selected entity changed.

Run English first. If Hindi/Hinglish is claimed, create independent language-specific development and held-out sets. Recognition language, transcript language and website UI language must be recorded separately.

Use at least three consenting speakers for initial spoken qualification, with different accents or speech rates. Include quiet speech and normal conversational speed. Treat this as initial evidence, not proof for all people with speech impairments. Add individual-user calibration and a configurable retry/clarification strategy without requiring exaggerated pronunciation.

## 19. Live test setup and recording

Record date, build/commit, local modifications, OS, Chrome version, viewport, zoom, microphone, headphones/speakers, recognition language, site/UI language, account tier and page type. Never record passwords, OTPs, cookies or provider keys.

Use an owned private GitHub repository, an owned Reddit test space and deliberate owned account data. Sign in before tests. Amazon cart tests must use a chosen test item and restore the starting cart. Netflix needs an existing subscription. Do not create paid subscriptions or make purchases for this plan.

For each attempt record:

`Case ID | site | initial state | intended phrase | recognized transcript | resolved intent/entity | confirmation | expected state | observed state | end-of-speech-to-effect latency | retries | physical assistance | result | evidence | bug`

Results are Pass, Fail, Blocked, Not implemented or Not applicable. A missing subscription or unavailable account-tier control is Blocked/Not applicable, never Pass. A fallback to face or hand is an assisted result, never a voice-only Pass.

Store private recordings and screenshots in ignored local storage. Prefer sanitized fixture evidence for tracked documentation. Normal diagnostic logs should record action IDs, timing, result categories and revisions without raw transcripts or page content. Any temporary detailed QA capture should be explicit, local and removable.

## 20. Voice-only scripted journeys

Run every journey three times from a reset starting state. Use different held-out phrasing on each repetition. Disable camera and dwell. No pointing or keyboard assistance after setup. Record every clarification and retry.

### Wikipedia

1. Search for India, choose the correct article, ask for sections, open Geography, find a term, go to the next match, return to introduction.
2. Search Mercury, choose the element through spoken disambiguation, follow a named article-body link, open a reference, return to its origin and go back to the article.
3. Open a long article, select a later section, scroll, refresh, rebuild section context and ask what commands are available. If TTS is implemented, read a paragraph and interrupt it without stopping recognition.

### GitHub

1. Search for an exact repository, open it, open a folder and file, announce the path, select another branch and verify branch/path identity.
2. Open Issues, search a phrase, select an issue by number, return and open a pull request's changed files. Request an excluded merge action and verify rejection.
3. In the owned test repository, draft an issue title/body containing "scroll down" and "send", preview, cancel submission, then separately confirm a test submission. Verify one issue and clean it up deliberately. If issue publication is not implemented, mark this journey Not implemented rather than replacing it with a click.

### Reddit

1. Search a topic, choose a post, open comments, change comment sort, expand a named thread, select a child comment and return to the feed.
2. Select a video post, request "like the video", hear the upvote preview, cancel, then confirm once. Repeat the same request and verify it stays upvoted. Restore the initial vote.
3. In the owned test space, open a scoped reply editor, dictate a reply containing command words, finish dictation, preview/cancel and separately publish one confirmed reply if supported. Verify ownership and exact parent thread.

### Amazon India

1. Search headphones, apply price/brand filters, change sort, select an announced product, choose a variant and report its selected state. Return to results and remove a filter.
2. Open details, inspect images, close zoom, open reviews, choose an available review filter and return. Request an unavailable feature and verify an honest response.
3. With the chosen test item, request cart addition, cancel once, then confirm. Open cart, verify exact variant/quantity, change quantity deliberately and restore/remove only the test item. Request checkout completion and verify rejection without activating a purchase control.

### Spotify

1. Search an artist, choose a song by title and artist, play, pause, resume, change volume, seek where permitted and announce the current track.
2. Open an album/playlist, play, go to next track, distinguish restart from previous, show queue and select a numbered candidate. Account restrictions must produce an explanation.
3. Request saving the current track, cancel once, confirm once, repeat "like this song" and verify it remains saved. Restore original saved state. Run the supported flow with player audio through speakers and check for self-triggered commands.

### Netflix

1. Choose the test profile, search a title, open details, start playback, pause/resume, seek and return to browsing through supported controls.
2. Open a series, choose season/episode, select a subtitle language and audio language that actually exist, disable subtitles, and use skip intro only when shown. Test fullscreen separately and record any required physical activation.
3. Request "like the video", verify a title-rating preview for the current profile, cancel, confirm, repeat and restore initial rating. Add/remove My List only if implemented. Run a 15-minute listening/playback interference test.

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
- Relative and absolute times, zero, out-of-range volume, negative quantity and impossible episode/line numbers.
- Dictation of command words, correcting a draft and exiting dictation intentionally.
- Website audio containing commands, assistant TTS echo and ordinary conversation near the microphone.
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
| Media stability | No unintended action during declared sustained playback tests |
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
9. Run media interference, slow-response and stale-context tests.
10. Test optional face/hand operation for regressions separately.
11. File reproducible bugs with expected entity/state, actual entity/state and whether typed input also failed.
12. Qualify support per workflow. Recheck affected live actions after significant site changes.

A useful first milestone is Wikipedia search/sections, GitHub repository/files, Spotify basic player control and Netflix pause/seek. Reddit thread selection and Amazon variants then use the same context machinery. Guarded writes come after that machinery is dependable. All six remain in scope; this ordering makes failures easier to diagnose.

## 24. Support statement template

For each site, publish its domain, supported workflows/action IDs, tested date, extension build, Chrome/OS, UI language, recognition languages, account requirements, voice-only result counts, latency sample counts, known limitations and excluded actions.

Example wording for a future verified release: "Spotify Web: voice search, track selection, pause/resume and player volume tested on the listed build and account tier. Queue editing and playlist creation are not supported in this release." Use actual evidence before publishing the statement.

Do not describe planned catalogue coverage as shipped functionality. Do not describe an assisted fullscreen test as voice-only fullscreen. Do not describe a fixture reaction test as successful live Netflix rating.

## 25. Decisions fixed by this plan

- The first six Group A sites are Wikipedia, GitHub, Reddit, Amazon India, Spotify Web and Netflix.
- Website workflows prioritize natural spoken language and work without pointer positioning.
- Face and hand remain optional and receive regression coverage.
- Site context determines what "like", "next", "pause" and "this" mean.
- Ordinary commands retain bounded Jev classification; broader requests retain the existing explicit wake route.
- Application code controls action whitelists, target validation, confirmations and transaction exclusions.
- Desired-state reactions must not toggle on repeated commands.
- Initial account mutations require voice confirmation.
- No live purchase completion, merges, account deletion or unbounded generated-code execution is included.
- Voice-only support is a measured workflow claim, with explicit setup and browser limitations.
- Implementation, hardware testing and live-site qualification are still required after this planning task.
