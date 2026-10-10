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

## Development verification

```bash
npm run check
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
```

The Mac workflow builds an arm64 app and DMG on `macos-26`, runs the real installer in a temporary directory with spaces in its path, rejects unsigned installation without an opt-in, verifies the DMG hash, ad-hoc verifies the installed bundle, checks the executable's stopped-first-launch diagnostics, installs over a prior copy, checks a user-data sentinel survives, rejects a corrupted DMG without replacing the app, launches the installed WKWebView and React frontend, captures a screenshot, and checks installer staging cleanup.

Download the workflow's `handsfree-macos-test-evidence` artifact for the JSON validation report and live Mac-panel screenshot. Hosted runners verify packaging and basic launch. They do not verify an M4's camera, lighting, movement comfort, native app input permission dialogs, or real app control. Finish those checks on a physical M4 with `npm run tauri build`'s exact candidate DMG before calling those features qualified.

## Product direction

The detailed app, extension, website, floating panel, security, and release plan lives in the root `app-docs.md`. macOS/M4 is the primary release target. Arch/Hyprland is a later platform gate. BnB-Sample informed the worker/action-policy boundaries, but its checked-in platform adapter currently provides native control only on Windows, so Handsfree uses a dedicated macOS input adapter.
