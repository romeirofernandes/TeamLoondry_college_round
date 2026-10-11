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
7. Start the website in a second terminal with `cd next`, `npm ci`, then `npm run dev`. Open `http://localhost:3000/dashboard` from the extension's **Open dashboard** button.
8. Complete the dashboard setup. Choose any combination of voice, head movement, and hand movement. Allow only the selected devices. Voice alone needs no camera. You can skip access or calibration and return later.
9. Select **Start session**, or use **Start Handsfree** in the popup while on a normal webpage. Capture continues in Chrome's offscreen document when the popup closes or you return to another tab. The top-right **Profile** button opens editable preferences. Dashboard camera previews are optional.
10. Select **Calibrate**. Follow five three-second captures: center, left, right, up and down. Hold each comfortable pose for its photo. Use small movements; you do not need to reach the screen edges. Face and hand save separate measurements. Photos stay in this session and clear on Stop. [How calibration works](docs/calibration.md) explains the mapping.
11. Use **Browser access** under Profile to review device access, webpage control, and optional tab commands. Chrome opens device prompts in a small window on the extension origin. Choose **Allow camera** or **Allow microphone** there, then **Return to Handsfree** to continue at your saved step.

Setup offers spoken guidance after about five seconds without interaction. **Read setup aloud** narrates instructions. **Listen for setup commands** enables microphone input for choices such as "voice only", "use hands", "next", and "finish setup". These commands stay in setup. If head and hand are both selected, only the chosen primary pointer moves the cursor; switch deliberately in Profile or say "use head" or "use hands" when voice is enabled. **Replay setup** is available in Profile.

The Chrome dashboard shortcut is `chrome-extension://<extension-id>/dashboard.html#tabs`. It redirects to the configured website dashboard. The default website URL is `http://localhost:3000/dashboard`. For another development port or HTTPS deployment, update the saved `dashboardUrl` through the extension settings protocol and grant webpage access to that host before opening it.

Permissions and first-time startup require a user gesture. Someone can assist with setup if necessary. The spec's suggestion that a popup can start without any initial input needs this qualification.

To update after code changes, rebuild, click Reload on Handsfree in `chrome://extensions`, and reload the webpages being tested. Reopen the popup or dashboard and start a new session.

## Start with a controlled test page

In another terminal:

```bash
cd extension
npm run fixtures
```

Open `http://127.0.0.1:4177`. This page has a click counter, ordinary text fields, guarded password/payment fields, a submission counter, a contenteditable field, offscreen careers links, and duplicate target labels. Leave the terminal running while testing.

After changing extension code, run `cd extension && npm run build`, then use **Reload** on the unpacked extension at `chrome://extensions`. Refresh the controlled webpage and dashboard so their content scripts use the rebuilt version. The original installation and optional permissions remain the same. Keep `dist/` and local provider configuration out of version control.

## Try the controls

- **Face movements:** keep Face movements selected and calibrate. Hold a small head turn to keep the cursor moving in that direction. Return to neutral to stop in place; the cursor does not snap back. The dead zone absorbs small resting movements. Sensitivity adjusts cursor speed.
- **Hand gestures:** choose Hand gestures, then calibrate that mode. Keep your complete open palm, fingers and wrist visible in the camera preview. Your small measured movement area maps to the whole webpage. Hand sensitivity defaults to 1.6×; increasing it makes a smaller physical movement travel farther. Hold steady until the dwell ring fills, or use steady hand hold with dwell disabled. Pinching is never required.
- **Dwell:** enable dwell selection, aim at Count a selection, and wait for the visible ring. It defaults to 800 ms. Moving away cancels it. Remaining on an already activated target does not click repeatedly; leave and return to rearm.
- **Tracking loss:** cover the camera or move out of view. The pointer should freeze and no dwell or hand action should fire. Return to view, hold still briefly, and review the highlighted target before selecting again. Recalibrate after a posture change if needed.
- **Scroll:** say `scroll down` or `scroll up` for smooth scrolling, even before camera calibration. With edge scrolling enabled, hold the pointer near the top or bottom edge; leaving the edge or losing tracking stops edge scrolling. Scroll speed adjusts both modes. Pause or stop cancels every scroll.
- **Preferences:** the Pointer dashboard saves sensitivity (0.2–6×), dwell (400–5000 ms; default 800 ms), scroll speed (0.2–3×; default 1×), and Circle, Arrow, Crosshair or Spark cursors. Every cursor has the same visible dwell ring.
- **Pause:** say `pause handsfree`, click Pause, press Escape on the controlled webpage, or use Alt + Shift + P. Pointing, page actions, scrolling and dictation pause. The microphone keeps listening for session controls, including `resume handsfree`. Set your own pause and resume phrases in Voice. These exact reserved phrases also work during dictation. Stop releases the microphone.
- **Stop:** click Stop or say `stop handsfree` in command mode. This releases the camera and ends recognition.

Face is the default primary pointer. Hand is an explicit alternative rather than an automatic switch that might move the cursor unexpectedly. The displayed confidence is a geometry/presence proxy, not a calibrated probability of a correct selection.

## Enable voice

Browser speech is the default. It may send microphone audio to Chrome's speech provider. If browser recognition is unavailable, the configured Groq fallback records completed utterances and sends them to Groq transcription. The webcam feed stays local. The dashboard shows the active voice status, and a transcript panel appears at the bottom right of the controlled webpage.

Choose a speech language in the dashboard. Automatic uses the browser locale for Chrome speech and automatic detection for Groq. Local-only mode is also available when Chrome supports on-device recognition and the selected language pack is installed. Local-only mode never falls back to a cloud service.

Ordinary commands use Jev through OpenRouter or TypeSafe to map speech to existing actions. Exact pause, stop, and cancel commands remain immediate. Dictation inserts literal text and bypasses Jev. The **Type a command** field lets you check actions independently of microphone recognition.
Core commands:

```text
scroll up
scroll down
go back
previous page
go forward
click this
open this
start typing
stop typing
submit form
confirm
cancel
show tabs
go to tab three
close this tab
pause handsfree
stop handsfree
```

`show tabs` numbers the tabs in the current browser window in tab-strip order. Say `go to tab three`, `switch to the twelfth tab`, or `go to tab 12` to select one. `close tab`, `close this tab`, or `close the tab` closes the current browser tab immediately. `previous page` works like `go back`.

Say `click` at the cursor position even when no component has snapped. Named finds still select a target for review. Coordinate clicks freeze when tracking is lost or stale. Browser-protected controls may reject synthetic events. Unknown phrases show what was heard and perform no action.

For video or music, say `play video`, `pause video`, `forward ten seconds`, or `rewind five seconds`. The largest visible media player is chosen across permitted frames, including embedded players. Enable webpage access for their origins. `pause` alone pauses Handsfree; `pause video` pauses playback. Say `scroll to the top` or `scroll to the bottom` to reach the page or container boundary.
Point at a target, then say `click this`. For explicit navigation, say `click the first link`, `open the second result`, or `click the ChatGPT link`. Ordinals one through ten resolve fresh rendered links, preferring heading links in main content and removing duplicate destinations. Generic links work when there are no result headings. Polite wrappers such as `could you please` are accepted. Say `open the second result in a new tab` or `in a background tab` for an HTTP or HTTPS destination; background opening preserves the current tab.

Say `focus the search box` or `focus Message` to focus a safe editable field without typing or submitting. `show links` lists up to ten numbered candidates; say `choose two`, then `click this`. Duplicate named labels also require a choice. Explicit link, named, and focus commands work without a head sample or calibration. Hidden, private, disabled, sensitive, covered, removed or changed targets cannot activate. Pointer-current commands retain the tracking safety gate. Unknown phrases show what was heard and perform no action.

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
open history
open downloads
open settings
open incognito
```

Tab-title ties ask you to say `choose one`, `choose two`, and so on. A title with no match changes nothing. Close tab acts immediately on the current browser tab. Pausing, stopping or changing the target cancels a tab action that is still waiting for Chrome. Incognito also needs Chrome's Allow in incognito setting in Handsfree's extension details. Chrome's own settings/history/downloads pages can open but their contents cannot be controlled by the in-page overlay.

New tabs open Chrome’s normal New Tab page. Say `open a new tab with phones under 30k` to search immediately, or open a tab first and say `search for phones under 30k`. Say `switch tabs`, `next tab`, `previous tab`, `go to tab two`, or `go to the Gmail tab` to switch. `Show tabs` lists numbers in the controlled window; duplicate titles ask you to choose. These supported commands do not need `hey handsfree`.

## Providers and arbitrary commands

Exact local commands bypass providers, including `click this`, `open Careers`, `scroll down`, `next tab`, and `search for jazz in a new tab in background`. Other ordinary speech can use Jev. Jev also chooses among current tab titles and bounded page labels. Requests starting with `hey handsfree` use Groq with `qwen/qwen3.8-27b`. Start each arbitrary request with that prefix in the same utterance. Unrecognized ordinary speech does not fall back to arbitrary commands. For example, say `hey handsfree find the careers link`. Matching IDs highlight available top-document controls; say `click this` to activate. Explicit named actions such as `hey handsfree click Careers` use local label matching to activate a real control; ambiguous labels ask for a numbered choice. Find-only requests highlight. Ask `hey handsfree summarize this page`, a page question, or a general question to receive a text answer in the webpage overlay and dashboard feedback. Arbitrary navigation requests can also map to existing browser actions. Form submission still requires a separate confirmation. Closing a tab acts immediately.

Provider output is validated. Unknown IDs, unsupported actions, ambiguous results, timeouts, and provider errors cause no activation. Up to 1,500 target labels can be sent, including offscreen targets. Closed shadow roots and cross-origin iframe contents are not scanned.

The local build reads `extension/config/providers.local.json`, which is gitignored. Use `providers.example.json` as the format. This workspace's supplied credentials are already configured; no values belong in tracked code or documentation. Groq requests rotate across up to four configured keys, including transcription requests. This local build uses the four working supplied keys; the rejected fifth is excluded. Keys are bundled in the local extension build. Keep `dist/` out of GitHub too.

The dashboard accepts local overrides without exposing stored values back to webpages. Saving empty provider values disables that provider. Without Jev, exact commands still work. Browser speech may send audio to Chrome, Groq fallback sends audio to Groq, Jev receives command text, language, up to 50 tab titles and up to 80 page labels, and wake Groq requests receive command text, target labels, page title and URL, and at most 12,000 characters of public page text. Inputs, editable regions, passwords, scripts and Handsfree UI are excluded; avoid asking page questions on sensitive documents. Answers are displayed as text, never HTML or code. Camera frames remain local.
Jev accepts an optional `jevKeys` array together with the legacy `jevKey` string. The combined keys are deduplicated and rotate independently of Groq. Authentication, rate-limit and transient transport/server errors try each key at most once; invalid semantic output is not retried. Exact local commands bypass Jev. Runtime status exposes only key counts, and saving a legacy nonempty key retains existing configured keys. An empty legacy key disables Jev; an explicit list replaces that runtime list.

The dashboard accepts local overrides without exposing stored values back to webpages. Saving empty provider values disables that provider. Without Jev, exact commands still work. Browser speech may send audio to Chrome, Groq fallback sends audio to Groq, Jev receives command text, and wake Groq requests receive command text, target labels, page title and URL, and at most 12,000 characters of public page text. Inputs, editable regions, passwords, scripts and Handsfree UI are excluded; avoid asking page questions on sensitive documents. Answers are displayed as text, never HTML or code. Camera frames remain local.

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

With the Next dev server running, `node tests/dashboard-next.mjs` additionally checks the actual website dashboard against the packaged extension. `node tests/tracking-timing.mjs` checks capture when the preview video clock freezes.

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
- [Group B commands and verification limits](docs/group-b-support.md)
- [Testing and laptop checklist](docs/testing.md)
- [Implementation review and verification](docs/review.md)
- [Implementation tickets](.scratch/handsfree/issues/)
- [Domain glossary](GLOSSARY.md)

All 17 skills named in `skills-lock.json` are installed under `.agents/skills/`. That directory, a root `skills/` folder, model caches, build output, and private local notes are gitignored. The lock lists sources and content hashes, not immutable Git commits; installation uses those listed GitHub paths. No keys or real environment files are committed.


<!-- handsfree-release:start -->
## Install or update the Mac app

Latest tested preview: [v0.2.0-preview.25](https://github.com/romeirofernandes/TeamLoondry_college_round/releases/tag/v0.2.0-preview.25). Apple Silicon, macOS 26+. This preview is unsigned and not notarized.

The repository is private. Collaborators still need an authenticated download; these commands reuse your existing GitHub CLI login without asking you to sign in again. Quit Handsfree before updating.

```bash
curl -fL --retry 3 -H "Authorization: Bearer $(gh auth token)" -H "Accept: application/octet-stream" \
  https://api.github.com/repos/romeirofernandes/TeamLoondry_college_round/releases/assets/629220054 -o /tmp/install-handsfree.sh
HANDSFREE_ALLOW_UNSIGNED_MAC=1 HANDSFREE_VERSION=v0.2.0-preview.25 bash /tmp/install-handsfree.sh
open "$HOME/Applications/Handsfree.app"
```

To update using the separately published update entry point:

```bash
gh release download v0.2.0-preview.25 --repo romeirofernandes/TeamLoondry_college_round --pattern update-app.sh --dir /tmp/handsfree-update --clobber
HANDSFREE_ALLOW_UNSIGNED_MAC=1 HANDSFREE_VERSION=v0.2.0-preview.25 bash /tmp/handsfree-update/update-app.sh
```

The installer verifies the DMG checksum, stages replacement, preserves app data, and refreshes an existing browser registration. `GH_TOKEN` can supply an existing credential for automation. For a manual download, get the DMG, `SHA256SUMS`, and `install-app.sh` from the release page, keep them together, then run:

```bash
HANDSFREE_ALLOW_UNSIGNED_MAC=1 bash install-app.sh --local-package Handsfree_0.2.0_aarch64.dmg
```

Setup, compact panel, browser pairing and verification limits: [desktop guide](desktop/README.md). Full plan: [desktop/app-docs.md](desktop/app-docs.md). Local Writing remains on-device; native Writing is still pending.
<!-- handsfree-release:end -->
