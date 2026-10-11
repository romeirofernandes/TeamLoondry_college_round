# Handsfree — System Architecture & Technology Decisions

## Executive summary

Handsfree is a Chrome Manifest V3 extension for operating webpages using voice, face movement, broad-hand movement, and optional hand gestures. It controls an in-page cursor and DOM targets; it is not an operating-system-wide pointer. The repository also contains a Next.js website used for the landing experience, dashboard, benchmark report, downloads, and end-user documentation, plus an experimental desktop/Tauri application.

**Verified:** the production browser flow is split across an MV3 service worker ('extension/src/background.ts'), an offscreen document ('extension/src/offscreen.ts'), content scripts ('extension/src/content/*'), and React UI ('extension/src/ui/index.tsx'). 'extension/src/shared.ts' is the typed cross-context message and state contract.

**Technical rationale:** this split fits Chrome’s isolation and lifecycle constraints. Privileged tab/storage operations belong in the service worker; a content script has the webpage DOM; the offscreen document keeps microphone/camera/speech work alive when the popup is closed.

**Inference / needs confirmation:** repository code shows the implementation, but does not record the original team’s decision process for every library or provider. Rationale in this document is therefore labeled separately rather than attributed to the original authors.

## Scope and evidence method

This document was produced from source/configuration inspection, including 'extension/manifest.json', the extension background/offscreen/speech/recording/providers/shared modules, parser/ranking/safety modules, content runtime/DOM/overlay modules, tracking/gesture sources, Next application sources, package manifests, tests, and 'docs/architecture.md'.

It describes source present on **2026-10-11**. It deliberately does not reproduce local provider configuration, tokens, or other secrets.

Evidence labels used below:

- **Verified** — directly demonstrated by a named file/configuration.
- **Technical rationale** — engineering analysis of a verified implementation.
- **Inference / needs confirmation** — plausible interpretation not proven by code.

## Runtime architecture

~~~mermaid
flowchart LR
  User[User: microphone, camera, popup, dashboard] --> Popup[Extension popup / React UI]
  User --> Offscreen[Offscreen document]
  Popup <-->|chrome.runtime messages| SW[MV3 service worker: background.ts]
  Dashboard[Next.js dashboard: configured origin] <-->|validated bridge messages| SW
  Offscreen <-->|OFFSCREEN_COMMAND, HEARD, POINTER, TRANSCRIPT| SW
  Offscreen --> Speech[SpeechAdapter / RecordedSpeech]
  Offscreen --> Tracking[Tracker: local face/hand tracking]
  Tracking --> Gesture[Optional gesture worker: MediaPipe HandLandmarker]
  SW <-->|PAGE_STATE, PAGE_ACTION, FIND_RESULT| Content[Content runtime]
  Content --> DOM[Webpage DOM + passive overlay]
  SW --> Storage[chrome.storage.local: settings, calibration, logs, routines]
  SW --> Chrome[Chrome APIs: tabs, scripting, permissions, offscreen]
  SW -. optional provider requests .-> Jev[Jev via TypeSafe/OpenRouter]
  SW -. optional cloud transcription / wake requests .-> Groq[Groq]
~~~

### Responsibilities and trust boundaries

| Component | Verified responsibility | Communication / dependency |
|---|---|---|
| Service worker | Owns session state, target tab selection, permissions, storage, tab operations, provider routing and action dispatch. | 'chrome.runtime.onMessage'; 'chrome.tabs', 'chrome.scripting', 'chrome.offscreen', 'chrome.storage' in 'background.ts'. |
| Offscreen document | Starts/stops Tracker, browser speech, recording fallback, spoken feedback and gesture runtime. | Receives 'OFFSCREEN_COMMAND'; emits typed messages with 'send()' in 'offscreen.ts'. |
| Content runtime | Scans visible page targets, snaps/validates selection, carries out safe page actions, dictation/forms/media/scroll, and renders overlay feedback. | 'ContentRuntime.handle()' in 'content/runtime.ts'; injected by 'content/index.ts'. |
| Popup/controller | Starts, pauses, resumes, stops, calibrates and displays session state. | React entry in 'ui/index.tsx'; messages through 'shared.ts'. |
| Next website dashboard | Hosts setup/preferences/dashboard UI outside the extension package. | Configured dashboard route, isolated bridge and sender/URL checks in background/bridge code. |
| Providers | Optional transcription, command mapping, arbitrary request and page-answer paths. | Network code and response validation in 'providers.ts'; host/CSP endpoints in 'manifest.json'. |

**Verified security boundary:** untrusted content-script senders can only send SET_STATE, METRIC, or PAUSE from the active target tab; privileged control messages require an internal extension sender or a validated configured dashboard sender ('background.ts', 'handle()').

## Voice-command data flow

~~~mermaid
sequenceDiagram
  participant U as User
  participant O as Offscreen document
  participant S as SpeechAdapter / RecordedSpeech
  participant W as Service worker
  participant C as Content runtime
  participant P as Page / overlay
  U->>S: Speak
  S->>O: final or interim transcript
  O->>W: TRANSCRIPT (interim), HEARD (final)
  W->>W: sessionIntent / parseIntent / site parser
  alt Local browser or page intent
    W->>C: PAGE_ACTION
    C->>P: inspect target, act or reject, announce
  else Optional provider path
    W->>W: bounded target/tab context + validated response
    W->>C: supported PAGE_ACTION or FIND_RESULT
  end
  W->>C: PAGE_STATE / feedback state
  C->>P: overlay transcript and feedback
~~~

### Concrete lifecycle: “open Careers”

1. **Verified:** SpeechAdapter configures SpeechRecognition/webkitSpeechRecognition for continuous, interim recognition ('speech.ts', 'SpeechAdapter.open'). A final result calls its onText callback; 'offscreen.ts' turns it into HEARD via 'heard()'.
2. **Verified:** 'background.ts' routes final text through immediate session controls, 'parseIntent()' ('core/parser.ts'), site parsing and, only when appropriate, provider mapping. “open Careers” maps to a click-target intent locally.
3. **Verified:** the worker asks the target tab content runtime for targets, uses 'rankTargets()' ('core/ranking.ts') and dispatches PAGE_ACTION/FIND_RESULT.
4. **Verified:** ContentRuntime rechecks usable/visible/current targets. Duplicate matches become numbered choices rather than DOM-order activation; changed, hidden, private, sensitive or covered targets fail. Overlay.announce() presents feedback.
5. **Technical rationale:** target checks at both worker and page boundary reduce stale or provider-invented action risk. They cannot guarantee a site will accept every synthetic event or keep the same DOM after an asynchronous update.

### Alternate paths

- **Pointer:** Tracker produces PointerSample values; offscreen sends POINTER; ContentRuntime maps screen coordinates, snaps a PageTargets element, and ActivationGate enforces confidence/tracking/dwell conditions before activation.
- **Dictation/forms:** parser command mode switches to dictation; ContentRuntime inserts text only into safe editable targets. Form submission is intercepted and requires confirm in its time window.
- **Browser-level commands:** tab, history/downloads/settings/navigation actions remain with the service worker because content scripts cannot safely own tab privileges.
- **Wake-provider request:** only an utterance beginning with “hey handsfree” becomes an arbitrary Groq request. 'providers.ts' constrains schema, target IDs and action types; content still applies its own gates.

## Technology inventory and rationale

| Technology | Where used | Actual responsibility | Why it fits / trade-offs |
|---|---|---|---|
| TypeScript | All three packages | Shared typed state, messages, intents and UI/source modules. | **Technical rationale:** strong contracts are valuable across isolated contexts and asynchronous messages. It compiles away, so runtime validation remains essential. |
| Chrome Extension MV3 | 'extension/manifest.json' | Module service worker, popup, commands, optional host/tab access, offscreen document. | Fits Chrome extension distribution and least-privilege optional permissions. MV3 worker suspension makes the offscreen lifecycle necessary. |
| React 19 | Extension UI and Next website | Popup/dashboard/website components. | Reusable stateful UI in the existing codebase. Adds build/runtime complexity compared with raw DOM. |
| Next.js 16 App Router | 'next/app' | Website routes, fonts, theme and static/server-rendered UI. | Existing website convention; not on the extension’s privileged control path. |
| Tailwind CSS + custom CSS | 'next/app/globals.css', route CSS | Theme tokens, responsive layout and component styling. | Existing visual system without a large visualization dependency. |
| Web Speech API | 'speech.ts' | Browser recognition, interim/final transcripts, optional processLocally. | Low integration cost and browser-native microphone flow. Availability, language quality and provider processing vary by Chrome/platform. |
| MediaRecorder + Groq Whisper | 'recording.ts', 'providers.ts' | Browser-mode fallback audio transcription (whisper-large-v3-turbo). | Resilient fallback when browser recognition fails, but sends completed audio to Groq and depends on credentials/network. |
| MediaPipe Tasks Vision | Tracking and gesture worker source | Face/hand landmarks for local pointer/gesture inference. | Keeps camera frame inference local. Models/WASM increase packaged build and device-performance requirements. |
| Chrome DOM APIs | 'content/dom.ts', 'content/runtime.ts' | Visible target discovery, hit testing, focus, scroll, media/form controls and overlay. | Only a content script can see page DOM. Website markup, shadow DOM and cross-origin frames limit coverage. |
| Groq / OpenRouter / TypeSafe | 'providers.ts', provider configuration | Optional arbitrary questions, transcription and bounded natural-language-to-intent mapping. | Broader language handling without replacing local safety logic; introduces latency, cost, privacy and key management. |
| Vitest + Playwright | 'extension/tests', configs | Unit/integration and browser fixture checks. | Useful deterministic coverage; cannot prove human microphone accuracy, lighting or live-site stability. |

### Why TypeScript/JavaScript is appropriate

**Verified:** the project is TypeScript ('.ts', 'tsconfig.json') and uses browser APIs directly.

**Technical rationale:** JavaScript is the browser’s native programming environment; it exposes Chrome extension APIs, DOM APIs, media APIs, workers and event callbacks without a native bridge. Its asynchronous model maps directly to recognition events, tab messaging, media frames and provider fetches. TypeScript adds compile-time guarantees to unions such as Message and Intent, reducing mismatches between service worker, offscreen document and content script. Limits are runtime API/browser variation, weak guarantees across untrusted page DOM, and the need to validate provider output despite types.

**Alternative:** native-only code could access OS accessibility APIs but would not replace a Chrome content script’s DOM access. A backend could centralize AI behavior, but this repository intentionally has no application backend/authentication and would add privacy, operational and latency costs.

## Architecture decision records

### ADR-1: Chrome MV3 worker + offscreen media runtime

- **Evidence:** 'manifest.json' declares background.service_worker and offscreen permission; 'background.ts' commands 'offscreen.ts'.
- **Suitability / advantages:** keeps privileged browser APIs coordinated while allowing microphone/camera tracking to survive popup closure.
- **Costs:** multiple isolated contexts, message protocols and worker lifecycle/staleness handling.
- **Alternatives:** popup-owned capture (ends when popup closes); a persistent background page (not MV3 architecture).
- **Rationale status:** verified implementation; original choice motivation is inference.
- **Recommendation:** **keep**; test offscreen lifecycle across Chrome versions.

### ADR-2: Local deterministic parser before optional AI

- **Evidence:** 'parseIntent()' precedes mapCommand/resolveArbitrary in 'background.ts'; 'providers.ts' validates bounded JSON.
- **Suitability / advantages:** common control phrases work without provider keys; predictable commands retain low latency; uncertain actions can fail safely.
- **Costs:** deterministic grammar is less tolerant of recognition/name variation; providers add complexity when enabled.
- **Alternatives:** LLM-first routing would accept wider phrasing but makes latency/privacy/validation central to basic actions.
- **Recommendation:** **keep**, and investigate measured recognition-name normalization with an explicit ambiguity path.

### ADR-3: Content-side target validation and explicit ambiguity

- **Evidence:** PageTargets, rankTargets, ContentRuntime, ActivationGate, and form confirmation code.
- **Suitability / advantages:** activation happens near the real DOM and checks visibility/occlusion/currentness. Duplicate labels create choices.
- **Costs:** generic semantic matching is intentionally conservative; live page layout changes can invalidate actions.
- **Alternatives:** universal site-specific selectors would be brittle and do not generalize.
- **Recommendation:** **keep**; add controlled regression cases from observed confusing labels.

### ADR-4: Optional cloud fallback rather than a mandatory backend

- **Evidence:** browser speech is default; local-only mode never falls back; RecordedSpeech/transcribeAudio are conditional on provider availability.
- **Suitability / advantages:** keeps basic use local/browser-native while offering recovery.
- **Costs:** cloud mode shares audio/text with configured providers and requires network/keys.
- **Recommendation:** **investigate further** with clear in-product disclosure and latency/failure telemetry.

## Permissions, privacy and security

**Verified permissions:** storage, activeTab, scripting, offscreen, tts, and nativeMessaging are declared; tabs and broad HTTP(S) host access are optional. api.groq.com, openrouter.ai and local development hosts are declared host permissions. The manifest specifies a strict extension-page CSP and module service worker.

**Verified data handling:** settings/calibration/logs are stored locally; README and metrics code describe bounded logs that omit dictated text, camera frames, audio and keys. Camera frames are processed in the local tracking path. Browser recognition may use Chrome’s provider. Browser-mode fallback uploads completed recordings to Groq; Jev can receive command text/language/tabs/labels, while Groq page requests can receive bounded public page context. The provider code excludes invalid/unbounded inputs and validates output.

**Technical rationale:** separating optional permissions and validating dashboard sender URLs reduces unnecessary access and confused-deputy risk. These measures do not make a third-party page, speech provider or local build configuration risk-free.

## Reliability, error handling and benchmark context

**Verified code behavior:** speech reports startup/errors/restarts; local-only mode requests on-device recognition; tracking loss freezes pointer actions; confidence/dwell gates prevent automatic activation; form submissions require confirmation; provider results are schema and target-ID checked; stale operations use generation/page revision checks. Tests cover parser, target ranking, speech adapter, content behavior, permissions, background, provider and Playwright flows.

**Supplied project context (not independently discovered benchmark evidence):** preliminary single trials report Wikipedia manual 55 s vs Handsfree 50 s with 3 reported errors; Amazon 60 s vs 90 s with 6 errors; YouTube 25 s vs 32 s with unknown error count. Totals are manual 140 s and Handsfree 172 s, about **22.9% slower** for Handsfree. The context reports difficulty recognizing product/song names and an incorrect YouTube video selection, while voice pause/resume was convenient.

These results are not statistically significant, have one trial per method/task, lack a known YouTube error count, and are not a competitor comparison. They must not be used to claim broad performance superiority.

## Current limitations and engineering risks

1. **Recognition quality:** Web Speech behavior, language packs, accents/network, and product/song names can affect intent parsing before DOM safeguards help.
2. **Web variability:** inaccessible/changed/cross-origin/closed-shadow DOM controls may not be discoverable or activatable.
3. **Cloud trade-offs:** fallback transcription and provider-enabled requests add network, privacy, cost and availability dependencies.
4. **Browser restrictions:** protected Chrome pages and some synthetic browser actions cannot be controlled.
5. **Human-device validation:** automated tests do not establish camera comfort, lighting robustness, microphone accuracy or live account-site compatibility.
6. **Desktop runtime scope:** desktop/Tauri code exists, but this document does not infer that it is the primary released control path without release evidence.

## Prioritized future work

1. Run a multi-participant, repeated-task study with fixed task definitions, recognition/error taxonomy and separate manual baseline.
2. Add regression fixtures for confusing product/song labels and test ambiguity prompts, not only successful matches.
3. Instrument opt-in, privacy-preserving command outcome categories (recognized, ambiguous, failed validation, completed) without retaining dictated/private content.
4. Exercise offscreen service-worker recovery and speech fallback on supported Chrome versions and languages.
5. Maintain site-adapter fixtures against representative live layout changes; do not treat fixture success as production coverage.

## Glossary

- **Content script:** extension code running in a webpage context with DOM access but limited privileges.
- **Offscreen document:** an extension document that supports work not suited to an MV3 service worker’s lifecycle, here media/speech/tracking.
- **Intent:** typed action representation produced from a transcript (Intent in 'shared.ts').
- **Jev:** optional constrained natural-language command-mapping provider path.
- **Target:** discovered visible webpage control/label, assigned an ID and revalidated before action.
- **Dwell:** sustained pointer presence that triggers a guarded activation after configured time.

## Source references

- 'extension/manifest.json' — MV3 runtime, permissions, CSP and command.
- 'extension/src/shared.ts' — message protocol, settings, intent/state types.
- 'extension/src/background.ts' — orchestration, sender validation, Chrome APIs and routing.
- 'extension/src/offscreen.ts', 'speech.ts', 'recording.ts' — capture and voice lifecycle.
- 'extension/src/tracking.ts', 'gesture-runtime.ts', 'gesture-worker.ts' — vision/gesture path.
- 'extension/src/core/parser.ts', 'ranking.ts', 'safety.ts' — command/target/safety logic.
- 'extension/src/content/runtime.ts', 'dom.ts', 'overlay.ts' — webpage execution and feedback.
- 'extension/src/providers.ts' — provider requests and result validation.
- 'next/app/docs/page.tsx', 'next/app/architecture/page.tsx' — documentation UI.
- 'extension/tests/*', 'extension/playwright.config.ts', 'extension/vitest.config.ts' — automated verification.
