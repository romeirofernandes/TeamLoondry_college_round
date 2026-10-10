# Onboarding and dashboard verification

Implemented on 11 October 2026. The dashboard now starts with resumable setup, followed by a smaller Session view and editable preferences under the top-right Profile button.

## Behavior

- Voice, head movement, and hand movement are independent choices. All seven nonempty combinations persist. When head and hand are selected, one primary pointer controls the cursor. Changing it preserves a paused session.
- Existing settings migrate without discarding sensitivity, dwell, scrolling, or stored calibration. Older connected dashboard requests that edit `voiceOnly` still work.
- Setup offers spoken guidance after five seconds without interaction. It never advances automatically, starts a session, or turns on microphone recording. The offer stops after interaction and is also visible as text.
- Explicit setup listening uses the extension microphone and a trusted dashboard scope with a renewable lease. Setup transcripts cannot execute browsing commands. Recognition pauses during narration, and setup listening stops when the dashboard loses focus.
- Chrome device prompts stay on the extension origin. A reusable access window requests only selected devices and returns to the saved setup step. Voice alone does not request a camera. Local speech installation also returns to setup.
- Camera preview is optional. Help contains the command reference; Advanced contains providers and testing recipients. Profile changes clear pending actions and stale tracking state when input selection changes.

## Checks

Both packages pass TypeScript checks and production builds. The extension passes 2,607 unit tests across 16 files and 62 packaged Chromium scenarios. Focused tests cover input migration, microphone selection, setup speech isolation and leases, permission handoff, paused pointer switching, dictation cancellation, and pending submission invalidation.

The connected dashboard regression script passes scrolling, wake answers, session controls, saved settings and recipients, permission state, calibration display without photo persistence, and responsive layouts.

The onboarding browser script uses a disposable Chromium profile, fake camera/microphone devices, and deterministic transcripts. It verifies the idle spoken offer, keyboard selection and preserved focus while saving, empty selection validation, setup progress across reloads, microphone-only access and return, spoken navigation before starting a browsing session, all input combinations, returning users, replaying setup, and optional camera preview. Automated speech output is stubbed to verify routing and timing; this does not establish audible quality or recognition accuracy.

All nine dashboard views reflow at 320, 390, 768, and 1280 CSS pixels and at 200% text size. The setup flow also passes the four viewport widths. There were no JavaScript page errors. The axe run reports no WCAG-tagged violations across 22 checks: three setup steps, the microphone access window, and all nine dashboard views in both light and dark themes. Keyboard checks verify checkbox selection with Space, primary-pointer radio selection with arrow keys, and retained focus after saving.

Browser reports and screenshots are ignored under `extension/test-results/`.

## Run the connected checks

Start the website with `npm run dev` from `next/`, and rebuild with `npm run build` from `extension/`. Then run from `extension/`:

```bash
node tests/dashboard-next.mjs
node tests/onboarding-next.mjs
```

Set `HANDSFREE_DASHBOARD_ORIGIN` for another local port. The onboarding script can run axe audits by setting `HANDSFREE_AXE_MODULE` to the absolute path of an installed `@axe-core/playwright/dist/index.mjs`. For example, install the audit tool outside the repository:

```bash
npm install --prefix /tmp/handsfree-a11y @axe-core/playwright
HANDSFREE_AXE_MODULE=/tmp/handsfree-a11y/node_modules/@axe-core/playwright/dist/index.mjs node tests/onboarding-next.mjs
```

The audit uses WCAG A/AA tags and checks settled controls after saves and theme transitions. It does not establish full WCAG conformance.

## Hands-on qualification remaining

Test actual recognition and audible narration on the intended Chrome installation, with its installed speech voices and any selected local language pack. Check real head and hand calibration, deliberate switching while moving, permission denial/revocation, and screen-reader interaction with NVDA, VoiceOver, or the user's chosen reader. TalkBack behavior has not been qualified, and the Chrome extension is not an Android extension.

Reload the unpacked extension in `chrome://extensions`, then refresh the dashboard and controlled webpages. The manifest now includes Chrome's `tts` permission for setup narration. No provider credentials, environment files, deployments, or account writes were part of this change.
