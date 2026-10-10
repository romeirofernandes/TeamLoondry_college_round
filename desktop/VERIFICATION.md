# Mac release verification and remaining qualification

This report distinguishes installed-package evidence from physical-device and live-site qualification. The app is an Apple Silicon/macOS 26 preview. Native Writing and Linux native control remain follow-up work.

Verified release: [v0.2.0-preview.25](https://github.com/romeirofernandes/TeamLoondry_college_round/releases/tag/v0.2.0-preview.25), source `fcdcae5653a996406ef6812d9d8c564218133a31`, [Mac run 38093809120](https://github.com/romeirofernandes/TeamLoondry_college_round/actions/runs/38093809120). All workflow jobs passed. The second Mac publishing job downloaded the exact release and installed/updated it before publication. The root README contains pinned install/update commands.

Validation passed: 2,875 extension tests, 63 packaged Chromium scenarios, 13 desktop unit tests, 10 desktop UI checks, 17 Rust tests and 17 installed Mac smoke checks. Website type-check and production build passed locally with the merged protocol. Both original Mac screenshots were inspected after download; neither is blank. All four published package/script/ZIP checksums match, and the authenticated API curl installer equals the released asset. The extension ZIP excludes local provider configuration and configured secret values.

DMG SHA-256: `dcf706cfbad8854409dff18a556f9ee2c8bbf59bb536b9f73212a6153ab7cbb1`. The package is unsigned/ad-hoc and not notarized. Hosted results do not establish physical M4 qualification.

## Coverage

| Area | Automated evidence | Still needs a real Mac or live site |
| --- | --- | --- |
| Installation | Real ARM64 DMG, checksum, path with spaces, bundle identity and ad-hoc signature integrity | Browser-downloaded quarantine/Gatekeeper first open, user-specific filesystem restrictions |
| Update | Actual update entry point, adjacent preservation sentinel, corrupt replacement rejection, refusal while app runs, staging cleanup; second Mac downloads release and installs/updates | Stored WKWebView preferences and OS permission retention across unsigned builds on the M4; interrupted power/disk failure |
| Panel | Installed WKWebView renders React and calls Rust; actual window screenshots; visible-content capture gate; two viewport UI checks | Physical dragging, multiple monitors, Retina scale combinations, fullscreen Spaces, VoiceOver and long daily use |
| Tracking | Shared MediaPipe inference, landmark extraction, filtering and calibration; bundled models/WASM checked; packaged Chromium worker loads and rejects blank frames | Physical head/hand accuracy, comfort, lighting and camera permission/revocation |
| Native input | Rust stopped/pause/epoch/freshness/confidence gates, display geometry and allowlist checks | Actual pointer movement, click and scroll under M4 permissions; no input injection claimed from runner |
| Browser handoff | Installed host framing, exact origin restriction, one owner, renderer shutdown acknowledgement, real Chromium Start/Stop and connection-loss capture cleanup | Handoff while the desktop is actively using physical camera/microphone, Meet coexistence, real browser profiles |
| Permission UI lifetime | Real Chrome UI closure/completion releases native ownership; unit tests cover acknowledgement, rejection and disconnect | OS prompt cancellation/denial/revocation with real devices |
| Speech and app commands | Swift helper packaged and runs on-device-only diagnostics; common-app parser/allowlist compiled and tested | Microphone/Speech grants, on-device English availability and accuracy; spoken and typed Finder/Safari/VS Code launch on the user's Mac |
| File attachment | Browser File/DataTransfer bytes, input/change exactly once, no form submission; session/tab/URL/token/input/type/size/chunk validation and negative cases; native unauthorized-read rejection | Actual native chooser selection/cancellation and chooser-to-Chrome chunk transfer; signed-in site/server completion |
| Bounded browser requests | Provider output validation, explicit finite steps, fresh observation between steps, cancellation checks | Live cloud accuracy, page changes and provider latency; this is not a general native computer agent |
| Release contents | Credential-free CI extension build; published package/script/ZIP checksum verification; local provider secrets absent from downloaded ZIP | User-provided cloud settings and account-specific behavior |

## File attachment boundary

Pair the extension with the app and start the browser session. Say `upload file`, `attach file`, or `choose file` on a page with an ordinary main-frame file input. Focus the intended input, or use a page with exactly one eligible input. The native chooser displays the website origin; choose one regular file up to 20 MiB.

Cancellation, ambiguous inputs, navigation, session changes, replaced inputs, unacceptable types and incomplete transfer must leave the input unchanged. Attachment dispatches input/change once and does not click Submit. A site can start its own upload from the change event. Local attachment is not evidence that its server received the file.

Cross-origin frames, closed shadow roots, custom widgets without an ordinary file input, directory uploads and multiple-file selection are unsupported. Unknown MIME types fall back to `application/octet-stream`; restrictive MIME accept rules may reject them. This preview does not claim universal or bulletproof upload compatibility.

## Physical M4 acceptance checklist

1. Install from the README command or browser release downloads on macOS 26. Confirm first launch is stopped. Record any Gatekeeper prompt separately from the app's permission prompts.
2. Choose Head, Hand, Voice and combined input configurations. Verify only selected device access is requested. Complete five comfortable poses and check that left/right/up/down match movement for the actual camera.
3. In an empty test document, check pointer, pause, Stop, deliberate click and optional dwell. Revoke input/camera access and verify visible recovery with no stale action.
4. Try voice-only control with the camera off. Check on-device English availability, microphone/Speech grants, `open Finder`, `open Safari`, `open VS Code` when installed, and Stop.
5. Pair a normal Chrome profile using its actual extension ID. Start desktop capture, then start the extension. Desktop camera, microphone and native input must stop before browser capture begins; the panel hides. Stop the extension and confirm desktop capture does not restart automatically.
6. Repeat while camera or microphone permission is pending, when a permission page closes, and after the native connection disappears. A denied handoff must leave browser capture off.
7. On an owned upload fixture, select a small text file and then a PDF/image through the actual native chooser. Verify exact bytes and one attachment. Cancel, switch tabs, navigate, rerender the input and choose a rejected/oversized file. Confirm no wrong-field attachment and no automatic form submission.
8. Qualify signed-in upload sites separately. Record the local attachment and server response independently. Do not infer upload success from the filename appearing in an input.
9. Save calibration/input preferences and panel placement, quit through the app menu, update, and confirm preferences and OS grants. Closing/hiding the panel is not quitting the process.
10. Check dragging, corners, Retina/multiple displays, fullscreen Spaces, sleep/wake, device unplugging and VoiceOver. Leave failed cases unqualified until reproduced and fixed.

## Reproduce developer checks

```bash
npm --prefix extension run check
npm --prefix desktop run check
cargo test --locked --manifest-path desktop/src-tauri/Cargo.toml --lib
npm --prefix next run typecheck
npm --prefix next run build
```

The Mac workflow builds the exact `.app`/DMG and runs `desktop/scripts/macos-smoke.py` against the installed package. Its Chrome fixture uses an isolated profile, synthetic camera and a temporary registered native-host launcher. It proves transport and lifecycle behavior, not physical tracking quality. Each published release includes `macos-validation.json`, two original window screenshots, `SHA256SUMS`, the DMG, install/update scripts and the companion extension ZIP.

Both clients must continue importing tracking implementations from `shared/tracking/`. Edit those modules when changing tracking; keep `extension/src/tracking/math.ts` and `calibration.ts` as re-exports. A regression test checks that the extension uses the same implementation as desktop, so copied algorithms cannot silently drift.
