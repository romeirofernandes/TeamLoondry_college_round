# Handsfree

Handsfree is a Chrome extension for browsing with face movements, broad hand gestures, and voice. It controls an in-page cursor, not your operating system. The existing Next.js landing page is in `next/`; the extension is in `extension/`.

The extension is a development build. Automated tests cover the browser actions and safety rules. Real camera tracking, microphone accuracy, lighting, posture changes, and setup time still need laptop testing.

## Install the extension

Use current desktop Google Chrome and Node.js 20.19+ or a current Node.js LTS release.

From the repository root:

```bash
cd extension
npm ci
npm run build
```

The first build downloads Google's versioned MediaPipe face and hand models, verifies their SHA-256 checksums, and packages the models, WASM, fonts, icons, and scripts locally. Later builds reuse the verified cached models. No backend or environment file is needed.

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository's **`extension/dist`** directory, not `extension/` or `next/`.
5. Pin Handsfree using Chrome's Extensions menu.
6. Open a normal HTTP or HTTPS webpage. Chrome settings, extension pages, the Chrome Web Store, and other protected pages cannot be controlled.
7. Click Handsfree, then **Open controls**.
8. Click **Start session**. Allow the camera when Chrome asks.
9. Keep the control window open and visible. It owns the camera and speech session; closing it stops capture. Do not minimize it while testing tracking.
10. Click **Calibrate / recalibrate**. Hold your comfortable neutral position for the first 2.5 seconds, then move comfortably left, right, up, and down until the eight-second calibration ends.
11. After media setup, use **Enable webpage access** to permit control across page navigation. **Enable tab commands** grants optional tab-title access when you want tab or find commands.

Permissions and first-time startup require a user gesture. Someone can assist with setup if necessary. The spec's suggestion that a popup can start without any initial input needs this qualification.

To update after code changes, rebuild, click Reload on Handsfree in `chrome://extensions`, and reload the webpages being tested. Reopen controls and start a new session.

## Start with a controlled test page

In another terminal:

```bash
cd extension
npm run fixtures
```

Open `http://127.0.0.1:4177`. This page has a click counter, ordinary text fields, guarded password/payment fields, a submission counter, a contenteditable field, offscreen careers links, and duplicate target labels. Leave the terminal running while testing.

## Try the controls

- **Face movements:** keep Face movements selected, calibrate, and move your head to steer. Small movements inside the dead zone do not move the pointer. Sensitivity changes the usable range.
- **Hand gestures:** choose Broad hand, then calibrate that mode. Move your palm broadly to point. Hold steady to confirm; pinching is never required. Face and hand have separate saved calibrations.
- **Dwell:** enable dwell selection, aim at Count a selection, and wait for the visible ring. It defaults to 800 ms. Moving away cancels it. Remaining on an already activated target does not click repeatedly; leave and return to rearm.
- **Tracking loss:** cover the camera or move out of view. The pointer should freeze and no dwell or hand action should fire. Return to view before selecting again.
- **Scroll:** say `scroll down` or `scroll up`. With edge scrolling enabled, hold the pointer near the top or bottom edge.
- **Pause:** click Pause all, press Escape on the controlled webpage, or use Alt + Shift + P. Cursor activation, voice recognition, and dictation stop together. Resume with the button or shortcut, because paused recognition cannot hear a resume phrase.
- **Stop:** click Stop or say `stop handsfree` in command mode. This releases the camera and ends recognition.

Face is the default primary pointer. Hand is an explicit alternative rather than an automatic switch that might move the cursor unexpectedly. The displayed confidence is a geometry/presence proxy, not a calibrated probability of a correct selection.

## Enable voice

Speech starts in on-device-only mode. It needs a Chrome build supporting local speech recognition and an installed English language pack. Click **Install local English speech pack**, then restart the session. If Chrome reports that local speech is unavailable, pointing still works.

You can explicitly select **Browser speech service** and restart. This can send microphone audio to Chrome's speech provider. It is not covered by a promise that audio stays on-device. No silent cloud fallback occurs. Chrome, network availability, browser policy, and microphone permissions can affect recognition.

The Type a command field is an accessible fallback and a way to test actions independently of recognition.

Core commands:

```text
scroll up
scroll down
go back
go forward
click this
open this
start typing
stop typing
submit form
confirm
cancel
pause handsfree
stop handsfree
```

Point at a target, then say `click this`. Unknown phrases show what was heard and perform no action.

## Dictate and submit

1. Point at Search text or Notes on the fixture.
2. Say `start typing`.
3. Dictate a sentence. Saying `scroll down` now inserts those words; it does not scroll.
4. Say exactly `stop typing`, or press the Stop typing button.
5. Make corrections with ordinary input for now.
6. Say `submit form`. The form must wait.
7. Say `confirm` within 10 seconds to submit, or `cancel` to dismiss the request.

Changing the selected target, page, form action/method, or disconnecting the form cancels pending submission. Password and payment fields reject dictation. Standard submit controls and synchronous submit events triggered by extension actions are guarded. Arbitrary site JavaScript can bypass browser submit events with native `form.submit()` or delayed custom handlers; this build cannot promise universal interception. Use the fixture and non-sensitive forms when evaluating it.

## Manage tabs

Enable tab commands first. Open the fixture's Second test page in another tab, then try:

```text
new tab
next tab
previous tab
go to tab second handsfree page
background search for accessible browsing
search for accessibility tools
close tab
confirm
open history
open downloads
open settings
open incognito
```

Tab-title ties ask you to say `choose one`, `choose two`, and so on. A title with no match changes nothing. Close tab always needs a separate confirmation and binds it to the original tab. Incognito also needs Chrome's Allow in incognito setting in Handsfree's extension details. Chrome's own settings/history/downloads pages can open but their contents cannot be controlled by the in-page overlay.

## Optional arbitrary find

This is the only command path that uses an LLM. Add your own OpenAI API key in Optional page find, grant access to the provider, and save. The key stays in extension-local storage and is never sent to webpages. Calls can incur charges on your provider account.

Say `find careers page`. The extension scans available top-document interactive targets, including offscreen targets, sends your phrase and their labels/roles to OpenAI, then scrolls to and highlights a returned match. It does not click. Say `click this` afterward to activate deliberately.

Duplicate labels or multiple returned matches ask you to choose. No match, an invalid response, a provider error, timeout, or missing key causes no activation. Requests are bounded to 1,500 targets with short labels. Closed shadow roots and cross-origin iframe contents are not scanned.

Remove the key and save to disable arbitrary find. Fixed navigation and tab commands do not use an LLM.

## Check timing and errors

Local run log keeps the newest 500 events and omits dictated text, camera frames, audio, and keys. Use Mark task start and Mark task complete around a defined browsing task. Mark selection error or accidental activation when you observe one. Inspect, export JSON, or clear the log.

The summary reports measured session/task durations, parser-recognized and unknown phrases, activations, losses, frame rate, latency, and your error annotations. A recognized phrase is not proof that the recognizer understood your intended command. Use the [manual evaluation checklist](docs/testing.md) to measure actual command accuracy and selection errors.

The original problem statement asks for comparison with mouse/keyboard input. The spec explicitly excludes a built-in comparison. The checklist describes how to collect a separate manual baseline; no side-by-side product feature is implemented.

## Run checks

```bash
cd extension
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Browser tests use `/usr/bin/chromium` by default. Set `CHROMIUM_PATH` to your local Chromium executable if needed. The automated extension fixture pregrants tab and localhost permissions in a temporary manifest; production permissions remain optional. Tests inject deterministic pointer/transcript messages through the production message protocol to verify browser behavior. Fake camera frames verify capture and local worker loading, not human tracking or microphone accuracy.

## Run the landing page

```bash
cd next
npm ci
npm run dev
```

Open `http://localhost:3000`. The landing keeps its charcoal/ivory theme, green accents, custom logo, and simple theme toggle.

## Project notes

- [Spec review and scope decisions](docs/spec-review.md)
- [Architecture](docs/architecture.md)
- [Testing and laptop checklist](docs/testing.md)
- [Implementation review and verification](docs/review.md)
- [Implementation tickets](.scratch/handsfree/issues/)
- [Domain glossary](GLOSSARY.md)

All 17 skills named in `skills-lock.json` are installed under `.agents/skills/`. That directory, a root `skills/` folder, model caches, build output, and private local notes are gitignored. The lock lists sources and content hashes, not immutable Git commits; installation uses those listed GitHub paths. No keys or real environment files are committed.
