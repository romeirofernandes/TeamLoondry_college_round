# Handsfree for macOS

Apple Silicon, macOS 26+. The app provides shared on-device head/hand tracking, five-pose calibration, guarded native pointer/click/scroll control, a draggable compact camera/start-stop panel, and separate setup/settings. Open **Settings and setup** from the menu bar to return to the full interface.

## Install and update

Use the current commands in the [root README](../README.md). The Mac workflow publishes a new preview only after its exact DMG passes installation, update, corruption rejection, native-host handoff, and installed WKWebView checks. Preview builds remain unsigned and unnotarized; installation requires an explicit opt-in. Quit the app before updating.

The repository is private. A collaborator's browser login does not authenticate anonymous curl. Downloads reuse an existing GitHub CLI login or `GH_TOKEN`; manual downloads from the release page also work. No credential is bundled into the app or extension.

## Run from VS Code

Install Node 22, stable Rust, and Xcode Command Line Tools, then:

```bash
cd desktop
npm ci
npm run doctor
npm run tauri dev
```

For a production build:

```bash
npm run check
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
npm run tauri build -- --target aarch64-apple-darwin --bundles app,dmg
```

The build verifies and bundles MediaPipe models and WASM. Both clients import their landmark extraction, inference settings, filtering, and calibration from `shared/tracking/`.

## Setup and compact panel

1. Select Head or Hand. The input choices, access, practice and ready sequence follows the extension onboarding structure.
2. Allow camera access when calibrating. Allow macOS input control separately. An always-on-top window itself does not need Screen Recording permission.
3. Calibrate five comfortable positions. Dwell starts off; enable it only after practicing in an empty document.
4. Choose a corner under Ready, then Show compact panel. Drag its camera area to move it. The compact view has only the camera and Start/Stop control, with error recovery when needed.
5. Stop releases camera and speech. Cmd-Shift-P pauses native input; Cmd-Shift-Space clicks a fresh confident sample; Cmd-Shift-Up/Down scroll. These shortcuts cannot activate input from a stopped or stale session.

The selected corner is saved. Dragging changes the current position; restoring an arbitrary dragged position between launches is not implemented yet.

## Pair the browser extension

1. Install the credential-free extension ZIP from the same release, or build `extension/` and load its `dist` directory at `chrome://extensions`.
2. Copy the 32-letter extension ID. In desktop Settings, register that ID under Browser connection.
3. Open the extension popup and choose Connect desktop. Keep the app running.
4. Browser Start claims capture through Chrome native messaging. The Mac session stops, camera and speech are released, the renderer acknowledges shutdown, and the compact window hides before browser capture begins.
5. Browser Stop releases its ownership. Desktop control stays stopped until you explicitly start it. A paired app becoming unreachable stops browser capture; disconnect pairing explicitly to use the extension independently.

The bridge uses a per-user Unix socket with a private directory, a selected extension origin, bounded messages, and no HTTP listener. Chrome, Edge and Chromium host manifests are registered for the current user. Updating the installer refreshes an existing registration. Moving the installed app manually requires re-registering.

## App commands

Use the command field in desktop settings, such as `open Finder` or `open Safari`. Supported names: Finder, Safari, VS Code, TextEdit, Notes, Mail, Calendar, Preview, Music, Terminal and Chrome. Missing apps produce an error. Arbitrary shell commands and URLs are refused.

Optional **Listen for app commands while running** uses a bundled Swift Speech/AVFoundation helper. It requests Microphone and Speech Recognition access, requires the Mac's on-device English recognizer, and never falls back to cloud speech. Recognition availability and real microphone behavior need physical Mac qualification. Native Writing/dictation is not implemented; the on-device Writing requirement remains.

## File attachment

During a paired browser session, say `upload file`, `attach file`, or `choose file`. The current top-level page must have exactly one enabled ordinary file input, or you must focus the intended input. A native file chooser shows the website origin. Choose one regular file up to 20 MiB.

The extension checks the session, tab URL, original input token, file type, sizes, and chunk order before assigning a File and dispatching input/change once. Cancel, navigation, replacement, or incomplete transfer leaves nothing attached. It does not submit the form. A website may upload immediately in its change handler; choosing the file authorizes attachment to that displayed origin.

This cannot promise every site's upload widget works: cross-origin frames, closed shadow roots, directory pickers, multiple-file selection and widgets without a regular file input are unsupported. Server-side upload success is not inferred from local attachment. Unknown MIME types use application/octet-stream and may be rejected by restrictive MIME accept rules.

## Verification boundaries

The release includes checksums, Mac validation JSON, a credential-free extension ZIP and live Mac screenshots. The runner validates installation in a path with spaces, updating, preservation, corrupt packages, signatures, startup, framing, origin restriction, session exclusion and the compact renderer. Unit and packaged Chromium tests cover the extension and file transaction failures.

Still require a real M4: camera/movement comfort and accuracy; actual pointer events; permission prompts and grants; microphone speech; interactive native file selection; signed-in website upload completion; manual dragging across monitors and fullscreen Spaces; long sleep/wake and daily use. Linux native control is still pending. See [the full app plan](app-docs.md).
