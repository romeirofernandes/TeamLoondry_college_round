# Group B implementation and verification

Updated 2026-10-10. Group B adds dedicated adapters for WhatsApp Web, Gmail, Google Meet, LinkedIn, IRCTC and Google Maps alongside the existing seven Group A adapters. This report describes the implemented command set and its verification limits. The [Group B plan](group-b-voice-first-website-support-plan.md) remains the target for live qualification.

## Command scope

The catalogue contains 64 Group B action IDs. 53 have handlers and 11 explicitly report a boundary. Handler availability depends on a unique, visible target and the current page context. A supported action ID does not establish compatibility with every account, language or current third-party layout.

| Site | Implemented workflows | Explicit boundaries |
| --- | --- | --- |
| WhatsApp, WA01–WA11 | Search and choose chats, unread/next chat, read current-chat messages, scroll messages, draft, guarded test send, clear draft, search messages, chat info | WA10 quoted-message replies; WA11 calls |
| Gmail, GM01–GM11 | Search in current account, list/open threads, inbox/latest message, compose and distinct recipient/subject/body fields, guarded test send, inline reply, archive/restore, read/unread, choose drafts, discard | GM11 attachments and browser file picker |
| Meet, ME01–ME10 | Confirm join/leave, desired microphone/camera/captions/hand state, participants/chat panels, draft and guarded private-meeting test send | ME09 presentation picker |
| LinkedIn, LI01–LI10 | Search jobs, location, job type/workplace filters, choose jobs, details, confirm save/unsave, company profile | LI08 contact messaging; LI09 applications; LI10 connection requests |
| IRCTC, IR01–IR11 | Exact station suggestions and ambiguity choices, full future date, class/quota, confirmed train search, choose train, availability/fare, swap stations, departure sort | IR10 passenger details; IR11 booking, payment and cancellation |
| Maps, MAP01–MAP11 | Search places, choose result, address/hours, directions lookup and displayed-route review, travel mode, choose route, verifiable map zoom, nearby search, toll/highway options | MAP08 unqualified canvas pan; MAP11 live navigation and Street View |

Domains are matched exactly over HTTPS. Google Maps is restricted to Maps paths on maps.google.com or www.google.com; unrelated Google pages do not receive the Maps adapter. Missing or ambiguous controls produce a refusal or a spoken choice. Ordinals require an announced list. Named WhatsApp chats go through chat search before choosing, including when one matching name is already visible.

## Sending test messages

In Dashboard → Voice, save a comma-separated list under **Owned test recipients**. Accepted entries include:

- `gmail:you@example.com`
- `whatsapp:exact-chat-id`
- `meet:abc-defg-hij`

Use recipients and private meetings you own or have permission to test. These local settings contain recipient identifiers, not provider keys. Sending starts disabled because the list is empty by default. The current-page command report shows a WhatsApp chat ID when one is available. A display name cannot authorize a WhatsApp send; the adapter requires a stable chat ID from the page and declines when it cannot establish one.

Gmail checks committed recipient chips, including CC/BCC, and rejects uncommitted address inputs. Every recipient must match the configured list. Multiple compose windows require an explicit draft choice. Inline replies bind their own editor. WhatsApp and Meet bind the current conversation or meeting and its editor.

Sending requires a nonempty draft, a unique Send control, a preview and a separate `confirm` within 15 seconds. Cancellation, page/editor/recipient changes and expired approval prevent activation. Each approval is consumed once. A successful result requires fresh outgoing evidence and a cleared draft. If the result is uncertain, the extension prevents repeating that send automatically. Generic click or Enter commands cannot bypass the same account-write guards.

Example with an owned Gmail recipient already committed in the compose window:

```text
write the body
This is an owned test message.
finish dictation
send this email
confirm
```

## Meet and Maps behavior

During an active Meet call, each command or dictation segment must begin with `Handsfree`. `hey Handsfree` is accepted too; outside dictation it retains the existing Groq wake route. Both forms can end dictation. Unaddressed speech is ignored during a detected call. Use headphones for test calls. The prefix is not speaker authentication, and another participant saying it can still trigger a command. Participant-speech isolation and camera/microphone coexistence remain live qualification gates.

Maps first opens a directions lookup for named endpoints. It does not claim that raw search text identifies a resolved place. After Maps displays endpoints and routes, say `review directions`, listen to the displayed endpoints, selected mode and route, then say `confirm`. Changing that context invalidates approval. Implicit `home`, `work` or `here` requires clarification. The lookup uses the documented [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).

IRCTC searches require different exact station codes, a valid full future date, class and quota. Result verification checks all five values and fresh train results. CAPTCHA, OTP and authentication remain assisted steps; transaction controls are excluded.

## Automated verification

Run from `extension/`:

```bash
npm run check
```

This includes TypeScript, the complete unit/DOM/lifecycle corpus, a packaged extension build and Chromium browser scenarios. Group B fixtures exercise all six adapters through the production command protocol, literal dictation, owned-recipient cancellation and confirmation, exactly-once sends, stale targets, account context, desired states, station choices and dates, route endpoints, and unsafe-action refusals. They also cover Gmail navigation without a document reload and pause-preserving camera/voice-only transitions. Fake media and injected transcripts do not measure human recognition accuracy.

Run `npm run typecheck` and `npm run build` from `next/`. With the Next server available, `node tests/dashboard-next.mjs` from `extension/` checks the actual dashboard bridge, commands, pause/resume/stop, preference persistence, owned-recipient persistence, permission state, calibration display and responsive widths.

## Live checks and remaining qualification

Read-only public checks ran in a fresh Chromium profile. No signed-in account was modified and no real message, application, booking or payment was submitted.

| Site | Observed public result |
| --- | --- |
| WhatsApp | Browser compatibility screen, no linked account workflow available |
| Gmail | Sign-in redirect, no inbox available |
| Meet | Public landing page, no private call available |
| LinkedIn | Public/sign-in page, no signed-in job workflow available |
| IRCTC | Network failure, ERR_HTTP2_PROTOCOL_ERROR |
| Maps | Public Bengaluru Palace details and address/hours controls inspected; the packaged public adapter smoke was interrupted during navigation and did not pass |

These checks establish access limitations, not live adapter qualification. Signed-in read workflows, owned-account writes, real speech accuracy, physical face/hand control and Meet device coexistence remain manual qualification tasks. The implementation and fixture tests do not claim the plan's 95% speech accuracy or a production-ready certification for third-party sites.
