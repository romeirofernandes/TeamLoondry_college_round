# Handsfree for macOS

Handsfree Desktop is being built for Apple Silicon Macs with macOS 26. The current first slice provides a small floating control panel, on-device head/hand landmark tracking, comfortable five-pose calibration, native Mac pointer movement, guarded click/scroll shortcuts, sensitivity settings, an optional 1.2-second dwell click, and a hard pause/stop path.

Voice control, native dictation, semantic native-app selection, and coordinated extension capture are not implemented in this first slice. The browser extension continues to work independently. It is safer to name these gaps plainly than to tell someone a feature works when it does not yet exist.

## Run from VS Code on a Mac

Install the Xcode Command Line Tools, Node 22, and stable Rust. Open this repository in VS Code and run:

```bash
cd desktop
npm ci
npm run doctor
npm run tauri dev
```

`npm run doctor` reports the OS, CPU, and available Rust/Node versions. It does not ask for camera or input permission.

For a production DMG:

```bash
npm run check
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
npm run tauri build -- --target aarch64-apple-darwin --bundles app,dmg
```

The first build verifies the MediaPipe model hashes and uses locally bundled WASM/models. Model inference, preview frames, and camera data stay on the Mac. The only camera use description is in the app bundle's Info.plist.

## First use

1. Open Handsfree and choose Head or Hand.
2. Allow camera access when calibrating.
3. Approve macOS input-event access when asked. The session stays stopped until this succeeds.
4. Follow the five comfortable calibration poses.
5. Try pointer movement in an empty document before turning on optional dwell click.
6. Pause with Command+Shift+P. Stop from the panel to release the camera.

Command+Shift+Space clicks once at the current pointer. Command+Shift+Up/Down scrolls the frontmost app. Keyboard shortcuts are registered by macOS and can conflict with another app; the panel has a visible pause button and Escape pauses while the panel has focus. Dwell click starts off and must be enabled deliberately.

The first package is unsigned by Apple Developer ID. macOS may ask the user to approve opening Handsfree in Privacy & Security. Camera and native input grants are separate. A CI pass on a hosted Mac does not grant permissions on a user's Mac.

## Install the macOS preview

The current preview targets Apple Silicon and macOS 26 or newer. It is unsigned by Apple Developer ID and is not notarized. The installer requires an explicit opt-in, checks the package checksum and app identity, and installs into `~/Applications` by default. Use the exact pinned version below; preview releases are not resolved through GitHub's `/releases/latest` URL.

Download the installer and run it from Terminal:

```bash
curl -fsSL https://github.com/romeirofernandes/TeamLoondry_college_round/releases/download/v0.1.0-preview.1/install-app.sh -o /tmp/install-handsfree.sh
HANDSFREE_VERSION=v0.1.0-preview.1 HANDSFREE_ALLOW_UNSIGNED_MAC=1 bash /tmp/install-handsfree.sh
```

The script fetches the pinned DMG and checksum, verifies them, installs the app, and opens it. If Gatekeeper blocks the first launch, use System Settings > Privacy & Security > Open Anyway for Handsfree. Camera and macOS input-control permissions are separate grants requested only when their features are used.

To download the DMG yourself, verify it, and open it in Finder:

```bash
mkdir -p "$HOME/Downloads/Handsfree-preview"
cd "$HOME/Downloads/Handsfree-preview"
curl -fL https://github.com/romeirofernandes/TeamLoondry_college_round/releases/download/v0.1.0-preview.1/Handsfree_0.1.0_aarch64.dmg -o Handsfree_0.1.0_aarch64.dmg
curl -fL https://github.com/romeirofernandes/TeamLoondry_college_round/releases/download/v0.1.0-preview.1/SHA256SUMS -o SHA256SUMS
shasum -a 256 -c SHA256SUMS
open Handsfree_0.1.0_aarch64.dmg
```

The DMG opens a standard macOS installer window. Drag `Handsfree.app` to Applications. If macOS blocks it, approve it in Privacy & Security before reopening. Review the [pinned preview release](https://github.com/romeirofernandes/TeamLoondry_college_round/releases/tag/v0.1.0-preview.1) for the tested build's report, screenshot, checksum, and current limitations.

To reinstall/update from this pinned preview, close Handsfree and run:

```bash
curl -fsSL https://github.com/romeirofernandes/TeamLoondry_college_round/releases/download/v0.1.0-preview.1/update-app.sh -o /tmp/update-handsfree.sh
HANDSFREE_VERSION=v0.1.0-preview.1 HANDSFREE_ALLOW_UNSIGNED_MAC=1 bash /tmp/update-handsfree.sh
```

## Development verification

```bash
npm run check
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
```

The Mac workflow builds an arm64 app and DMG on `macos-26`, runs the real installer in a temporary directory with spaces in its path, rejects unsigned installation without an opt-in, verifies the DMG hash, ad-hoc verifies the installed bundle, checks the executable's stopped-first-launch diagnostics, installs over a prior copy, checks a user-data sentinel survives, rejects a corrupted DMG without replacing the app, launches the installed WKWebView and React frontend, captures a screenshot, and checks installer staging cleanup. The first two independent runs both passed.

Download the workflow's `handsfree-macos-test-evidence` artifact for the JSON validation report and live Mac-panel screenshot. Hosted runners verify packaging and basic launch. They do not verify an M4's camera, lighting, movement comfort, native app input permission dialogs, or real app control. Finish those checks on a physical M4 with `npm run tauri build`'s exact candidate DMG before calling those features qualified.

## Product direction

The detailed app, extension, website, floating panel, security, and release plan lives in the root `app-docs.md`. macOS/M4 is the primary release target. Arch/Hyprland is a later platform gate. BnB-Sample informed the worker/action-policy boundaries, but its checked-in platform adapter currently provides native control only on Windows, so Handsfree uses a dedicated macOS input adapter.
