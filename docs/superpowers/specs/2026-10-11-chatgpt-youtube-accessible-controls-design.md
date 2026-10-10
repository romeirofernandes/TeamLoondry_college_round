# ChatGPT and YouTube Accessible Controls

## Goal

Add dedicated Handsfree site adapters for ChatGPT and YouTube using the existing site-support pipeline. Voice users should be able to operate the common controls on either site and select YouTube videos that are already visible without using a pointer.

The work builds on the current `main` branch after the user's GitHub pull. Existing site adapters, voice commands, head tracking, hand-pointer gestures, and Gesture Config behavior must remain intact.

## User-facing commands

### YouTube

P0 commands:

- “Search YouTube for [query].”
- “List videos on screen.” Read and number visible video cards in top-to-bottom, left-to-right order.
- “Open video [number]” or “Play video [number].” Activate the selected card from the most recently announced visible list.
- “Open video [number] in a new tab.”
- “Open the video titled [title].” Match visible card titles; ask the user to choose if the title is ambiguous.
- “Pause,” “resume,” and “play.”
- “Skip forward [time]” and “go back [time].”
- “Set volume to [percent],” “mute,” and “unmute.”
- “Turn captions on/off.”
- “Set playback speed to [rate].”
- “What video is playing?” Read the current title and channel.

P1 commands, subject to controls available on the current page:

- “Open the description,” “show comments,” and “go to chapter [name].”
- “Like this video” and “subscribe to this channel,” with explicit confirmation before account changes.

Numbered video choices are scoped to the latest visible list and bound to each card's current URL and title. If the page changes, a card moves out of view, or the selected identity no longer matches, Handsfree must refresh the list or ask the user to choose again rather than activate a stale number.

### ChatGPT

P0 commands:

- “Start a new chat.”
- “Ask ChatGPT [question].” Enter the user's explicit request in the ChatGPT composer and send it.
- “Summarize this conversation.” Send this explicit request through the current ChatGPT page.
- “Stop generating.”
- “Regenerate the response.”
- “Read the last response.”
- “List conversations” and “open conversation [number]” for visible sidebar entries.

Handsfree operates the signed-in ChatGPT webpage and does not add or use ChatGPT API credentials. Prompt submission only happens for explicit “Ask ChatGPT …” or other explicit prompt commands. It must not turn unrelated page questions into silent submissions.

## Design

Both sites use the existing `catalogue.ts` action contracts, `SiteId` typing, adapter registry, site snapshots, deterministic phrase parser, and `SiteExecutor`. Site-specific selectors remain in `youtube.ts` and `chatgpt.ts`; the extension's generic voice, tab, and camera-control paths stay separate.

The YouTube adapter will expose visible video-card entities with a stable target identity, title, channel, and destination URL. “List videos on screen” will announce an ordered list and establish the existing expiring numbered-choice flow. Choosing a number revalidates page identity and the card before activation. Sorting is based on screen position, with row first and column second. Search results and home/recommended feed cards use the same list behavior where the page exposes matching visible cards.

The ChatGPT adapter will identify the composer, current conversation, visible conversation sidebar entries, latest response, and supported generation controls. Prompt entry and response reading will use existing safe DOM helpers and report when ChatGPT's current UI does not expose a reliable control. The adapter will not automate login, upload files, change models, or issue account-level actions.

Site actions remain tied to the current document and adapter revision. Controls that write account state require confirmation; navigation and explicit prompt submission are only executed for a matching, grounded target and phrase. Unsupported or ambiguous controls return a clear message instead of guessing.

## Files and integration

- Add ChatGPT and YouTube IDs, command examples, and capability descriptions to `extension/src/sites/catalogue.ts`.
- Add focused site adapters under `extension/src/sites/` and register them in `registry.ts`.
- Extend entity kinds, list-dialogue phrases, entity selection, and action operations only where the existing contracts cannot express the two adapters' required behavior.
- Add site fixtures and command coverage consistent with the existing site-support implementation when verification is requested.
- Keep UI/context output concise and grounded in controls found on the current page.

## Acceptance criteria

1. On YouTube home, recommendations, and search results, “list videos on screen” produces numbered visible cards in visual reading order.
2. “Open video two” activates the matching current visible card. Ambiguous title matching asks for a number; stale choices never activate a different card.
3. Core YouTube playback controls operate the current player and report unavailable controls accurately.
4. Core ChatGPT commands use the current webpage's composer, response, and conversation controls; explicit prompts are sent once, and unrelated speech never submits a prompt.
5. Both site contexts accurately report supported and unavailable capabilities for the current page.
6. Existing adapters and pointer/gesture features receive no behavior changes outside shared site contracts that are required for these adapters.
7. Typecheck and production builds pass. Manual browser instructions cover the visible-list, numbered-open, ChatGPT prompt, and response-read flows.

## Out of scope

- Direct ChatGPT or YouTube APIs, API-key setup, or account authentication automation.
- Automatic likes, subscriptions, comments, uploads, or other account changes without confirmation.
- Site-specific head-movement or hand-pointer calibration.
- Broad DOM automation across arbitrary websites.
