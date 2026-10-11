# Private password entry and password-manager popup access

Date: 2026-10-11
Status: approved by user; implemented locally with automated verification. Physical native-popup qualification remains a target-Mac check.
Execution: directly in the existing main checkout, without subagents. Preserve existing local changes. Do not push this feature without the user's later approval.

## User goal and agreed requirements

Users must be able to enter existing website passwords without speaking them aloud in public. Passkeys and a preconfigured password manager are optional. The fallback must use Handsfree's existing head/hand pointer and dwell controls. The user also wants to interact with the browser's saved-password popup, which the current page overlay cannot control. Plan and test the feature before treating it as ready; preserve normal voice, gestures, scrolling, form controls, and routines outside private entry.

The private keyboard necessarily handles selected characters locally while inserting them into the intended website's password field. It cannot truthfully promise that it never handles a password. The requirement is that those characters never leave the page input path for Handsfree storage, speech, providers, logs, routine steps, or native messages.

## Feasibility and chosen approach

There are three possible routes:

1. Private keyboard in the extension, plus explicit handoff to the existing optional macOS desktop companion for browser-owned popups. Recommended: the keyboard works independently and native pointer control can reach Chrome UI.
2. Password-manager-only login. Rejected as the only route because it assumes a saved password and an accessible manager.
3. A Handsfree credential vault and automatic credential injection. Excluded from this feature: creating a vault introduces credential storage, key management, recovery, and a larger security responsibility.

An injected content script can control website DOM and ordinary website dialogs. It cannot inspect, number, or click Chrome's internal autofill popup or OS authentication sheet through DOM selectors. Do not simulate DOM keyboard events and claim they operate native Chrome UI. The existing native macOS application already has guarded system pointer control and an authenticated native-messaging bridge. Extend its capture handoff for deliberate user control of the password popup. No password-manager credential API or extraction is required.

Native popup support is initially macOS, matching the existing companion. The standalone extension's private keyboard remains available without the companion. Other OS browser popups remain an explicit support boundary until a native implementation exists. Touch ID, PIN, passkey verification, and password-manager unlock remain under the browser/OS and user control.

## 1. Private entry flow

- Detect a focused, visible, enabled top-level `input[type=password]`, including dynamically changed types. Pause speech immediately and latch privacy until the user deliberately resumes. Show a small helper offering Private keyboard and password-manager popup control when the companion is available.
- Also accept an exact local command: `open private keyboard`, `show password keyboard`, or `private keyboard`. It opens on the focused password field, or on the single eligible password field. With several fields, present labelled field choices for head/hand selection. Never guess between current/new/confirm password.
- After microphone shutdown is acknowledged, show the website hostname, a masked entry indicator, and a large keyboard. The password remains masked throughout; no reveal button and no character announcements.
- The initial keyboard provides lowercase/uppercase Latin letters, digits, standard punctuation, space, backspace, clear, Done, and Close. Sticky Shift/Caps supports multiple uppercase characters. Every character is directly selectable using the user's existing pointer/dwell settings, physical pointer, or keyboard focus. Other character sets can still be entered using the user's physical/OS assistive keyboard; the initial on-screen layout does not claim universal language coverage.
- Write one character or editing action directly into the bound password field using its native value setter and input/change events as required by the form. No separate password buffer or original-value snapshot. Do not put the chosen character in custom events, telemetry, or Chrome messages. Preserve normal caret editing where available.
- Done retains the value and closes the keyboard. Close retains the current field value and closes without submitting. Clear explicitly empties the bound field. Avoid misleading Cancel/rollback wording, since the feature does not retain an original password copy.
- Closing never submits or presses Enter. Offer Resume voice separately, requiring an explicit selection and leaving the password field before restarting speech. Login submission uses the user's explicit login action and the existing form safeguards.
- On navigation, tab/session change, target replacement, field becoming read-only/disabled, password type changing, or keyboard teardown: stop editing immediately. Never follow a replacement input automatically. Clear transient references and close the keyboard; do not restart the microphone automatically.

The field is bound to its exact element, document, URL/origin, and form association/action. Before every edit, validate that the target remains connected, eligible and belongs to that binding. Allow HTTPS destinations and localhost fixtures; do not provide password entry into an insecure HTTP site or across an unverified frame. Cross-origin frames and closed page shadow roots are unsupported in the first version and receive specific guidance.

The keyboard's own UI lives in a closed shadow root marked `data-handsfree-ignore`. This prevents accidental page-context and ordinary target scanning; it is not a security boundary against a malicious destination page. That page can read its own form value. Display the destination clearly and make no claim of protection from a compromised page, browser, OS, or other privileged extension.

## 2. Pointer and dwell integration

The existing overlay intentionally ignores pointer input, and normal page targeting rejects sensitive fields. Add a dedicated private-keyboard target resolver before ordinary page hit testing; do not relax `editable()` or `sensitive()` globally. Password-field focus is a narrowly allowed operation, distinct from dictation and generic agent actions.

Use the existing ActivationGate confidence/freshness/pause rules. A held dwell activates a key once and requires leaving/reentering before a repeated dwell. Reset dwell on opening, target changes, tracking loss and privacy transitions. Backspace/Clear never repeat automatically. While the keyboard is open, edge scrolling and site gesture shortcuts cannot accidentally navigate, submit, open a new tab or trigger media actions; head/hand pointer movement remains available for selecting keys and closing the keyboard. Resume normal routing after explicit exit.

Never store selected keys, key IDs, pointer-to-key traces or password length in telemetry. Displayed masking stays inside the ignored local UI and is not spoken.

## 3. Speech and provider privacy

Introduce a global private-entry state in the service worker, keyed to the active document/session. Store only the secret-free privacy latch in session storage so worker restart fails closed. Entering privacy must:

1. Set the latch before further async work, cancel pending command/provider work, discard queued speech commands and clear visible/stored interim and final transcripts.
2. Tell offscreen capture to stop SpeechAdapter recognition and RecordedSpeech capture, stop microphone tracks, invalidate startup/restart generations, discard buffered audio and prevent fallback startup.
3. Block HEARD, TRANSCRIPT, UI_HEARD, TRANSCRIBE_AUDIO, setup/narration restarts and speech feedback restart paths while private. Reject requests before provider fetch. Abort cancellable transcription already in flight and discard its response.
4. Acknowledge capture shutdown before enabling the keyboard. If shutdown cannot be confirmed, keep entry controls disabled with a retry/stop explanation. Camera tracking may continue.
5. Restart voice only after an explicit Resume voice action in trusted Handsfree UI and successful target/session validation. Tab switching, settings, pause/resume, narration completion, dashboard lease expiry and service-worker restart must not bypass the latch.

Audio sent before privacy began cannot be retracted. The UI must describe the state accurately instead of claiming previously transmitted audio was erased. This feature avoids capturing speech during entry and prevents the keyboard characters entering the speech pipeline; it cannot prevent someone from saying a secret aloud before activating the protected flow.

Only metadata such as private=true, session/document identifiers, and lifecycle acknowledgements crosses Chrome messages. Password values and selected characters remain within the bound content-script input operation and the destination field. Exclude them from pageContext, form snapshots, adapter snapshots, dashboard bridge data and routine storage. Generic dictation into passwords, payment fields and OTP fields remains blocked. This feature supports password fields only; do not broaden it into payment or verification-code automation.

## 4. Browser password-manager popup handoff

Add an explicit `Control password popup` action to the helper/keyboard. It requires a paired, reachable desktop companion with usable native pointer permission and a configured head/hand input. If unavailable, show how to connect the companion and keep the private keyboard accessible. Do not silently install software or grant permissions.

Handoff is a capture transaction:

- Latch privacy and acknowledge microphone shutdown.
- Stop browser camera capture and await release before starting the desktop camera. Invalidate browser pointer/dwell authorizations and pending page/routine actions.
- Release the browser's capture ownership through the existing native bridge. Begin a dedicated native credential-control session with speech disabled. Use the app's existing calibrated system pointer, native click/dwell and safety watchdog to operate the visible Chrome popup. The user selects the account or saved credential; Handsfree does not enumerate vault entries or receive their values.
- Keep Chrome foreground; native status controls must not dismiss the popup by stealing focus. No automatic click on a credential suggestion or OS approval. Show accessible Return to browser and Stop controls through the desktop panel and retain emergency shortcuts.
- Return transaction stops native camera/input first, then reclaims browser capture and restarts only its selected camera inputs. Voice stays latched off until explicitly resumed.
- Disconnect, timeout, missing calibration, loss of native permission, stopped tracking or old epoch fails closed. Never run two cameras/controllers or resume a stale page action.

Bridge commands are narrow lifecycle operations, origin-paired and session-bound; no arbitrary keystrokes, shell commands, credential strings, screen/AX dumps or password-manager data. Native support is deliberately user-directed pointer control, not an LLM interacting with authentication UI.

## 5. Routines and dialogs

Private-entry controls and keyboard events are excluded from routine recording. Entering private mode suspends recording/replay at a clearly indicated boundary and requires explicit continuation afterward. Do not store or automatically replay passwords, password entry, credential selection or login submission.

Website login dialogs are handled through their ordinary visible DOM. The keyboard must work inside the active modal without selecting a hidden background password field. Native browser/OS dialogs use the companion path; do not confuse the two categories or promise every third-party manager is supported.

## File and interface map for implementation planning

- New `extension/src/content/private-keyboard.ts`: keyboard UI, eligible field discovery/binding, local edits and key hit tests.
- New `extension/src/privacy.ts` or equivalent small shared lifecycle module: secret-free latch/generation decisions, no credential values.
- `extension/src/content/runtime.ts`: focus detection, private pointer routing, exact private-input commands, target lifecycle and microphone acknowledgement.
- `extension/src/shared.ts`, `extension/src/core/parser.ts`: typed private-entry lifecycle messages and exact local intents. No password or key-character message fields.
- `extension/src/background.ts`: sender/session validation, privacy gate around all speech/provider routes, action cancellation, routine suspension and companion handoff.
- `extension/src/offscreen.ts`, `extension/src/recording.ts`, `extension/src/speech.ts`: privacy shutdown, startup/restart rejection and explicit reactivation.
- `extension/src/desktop.ts`, `desktop/src-tauri/src/bridge.rs`, `desktop/src/main.tsx`, relevant native session modules: capture transfer, native credential-control state and return handshake, reusing native pointer safety.
- Extension and website dashboard UI: privacy state, exact commands, connection/support guidance. Follow `next/AGENTS.md` for Next edits.
- README and speech privacy ADR: correct behavior, setup and boundaries. No credentials in examples.

## Verification and acceptance

Use only generated, disposable test secrets and synthetic login fixtures. No messages or real credentials are submitted during testing. Write a meaningful failing regression for each new privacy boundary before its implementation.

Unit/integration checks:

- Every key group, case/shift, repeated dwell, backspace/clear, caret edits, Done/Close without submit, existing browser-filled values and changed/replaced targets.
- Modal login with hidden background fields; several current/new/confirmation fields; disabled/read-only inputs; insecure origins; disconnected inputs; navigation/tab changes.
- Private entry stops the actual recognition/recording lifecycle; fallback tracks stop; delayed getUserMedia streams close; buffered audio and late transcripts never upload or route.
- Start/resume, settings/language changes, speech narration completion, dashboard lease timers and service-worker restoration cannot reopen capture during private mode.
- Sentinel password characters never appear in Chrome messages, state/history, logs, provider request bodies, routine draft/storage, adapter snapshots or page context. Record routine steps around entry and prove the private actions are absent.
- Head/hand pointer remains usable; stale/low-confidence samples cannot enter characters; site shortcuts cannot activate during entry; regular scrolling, dictation, forms and app commands recover after exit.
- Native handoff requires pairing and fresh state, enforces one capture owner, speech remains disabled, session loss invalidates actions, and return waits for native release.

Packaged Chromium checks:

- Open a disposable HTTPS/local login fixture, open keyboard by exact command, select keys through real DOM controls and injected tracked-pointer/dwell messages, verify masked value reaches only that fixture and submit count stays zero.
- Cover website modal login and multiple fields. Run a network spy for a known sentinel and assert no Handsfree/provider request contains it.
- Record routine before/after private entry and replay it; prove no credential step or automatic login is present.
- Rerun existing extension regression suite, typecheck/build, and appropriate form/voice/routine/gesture browser tests after integration.

Native manual qualification:

- With a disposable browser profile and test-only saved credential, open the real Chrome autofill popup, hand off, select through native head/hand/dwell, return and verify private speech state. Also exercise popup dismissal, permission denial, host disconnect, app stop and browser navigation.
- Rust/native tests prove gates and handoff state; DOM fixtures do not prove native popup usability or physical tracking comfort. Report that distinction explicitly. If the environment cannot perform the physical qualification, deliver the implemented path with that outstanding check clearly identified rather than claiming it passed.

Release acceptance: keyboard-only users can complete password entry without speech or password-manager setup; supported paired macOS users can deliberately operate the browser popup; no secret leaves the intended field path; privacy transitions fail closed; existing input modes pass regression checks. Push only after the user's later approval.
