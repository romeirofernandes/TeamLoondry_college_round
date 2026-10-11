# Onboarding and dashboard verification

Implemented on 11 October 2026. The dashboard now starts with resumable setup, followed by a smaller Session view and editable preferences under the top-right Profile button.

## Behavior

- Voice, head movement, and hand movement are independent choices. All seven nonempty combinations persist. When head and hand are selected, one primary pointer controls the cursor. Changing it preserves a paused session.
- Existing settings migrate without discarding sensitivity, dwell, scrolling, or stored calibration. Older connected dashboard requests that edit `voiceOnly` still work.
- Setup offers spoken guidance after five seconds without interaction. It repeats once after another five seconds without a response. A voice reply enables step narration when microphone access is granted. Any UI control interaction stops speech and persists silent setup across reloads and replay. It never advances or starts a session automatically.
- Setup listening, either automatic with an existing microphone grant and selected Voice input or explicitly enabled, uses the extension microphone and a trusted dashboard scope with a renewable lease. Setup transcripts cannot execute browsing commands. Recognition pauses during narration, and setup listening stops when the dashboard loses focus.
- Chrome device prompts stay on the extension origin. A reusable access window requests only selected devices and returns to the saved setup step. Voice alone does not request a camera. Local speech installation also returns to setup.
- Camera preview is optional. Profile now has Controls, Permissions and Advanced. Pointer, gestures and speech expand within Controls; all browser/device permission controls sit in Permissions. Advanced contains testing recipients, diagnostics and setup replay. The old Help tab is removed. Docs lives in the main website navigation at `/docs` and covers all fifteen registered site adapters, commands, source files, Jev and the Groq LLM route. Provider key forms and detailed status blocks have been removed from the website. Profile changes clear pending actions and stale tracking state when input selection changes.

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

## Remote gesture integration, 11 October 2026

The push required merging remote commit `e079d52`, which adds gesture shortcuts. The merge retains both setup narration and gesture commands in the extension protocol and offscreen controller, preserves both sets of dashboard styles, and exposes Gestures under Profile with an `open gestures` dashboard voice command.

The combined tree passes both TypeScript checks and production builds, 2,607 unit tests, 62 packaged Chrome scenarios, and both connected dashboard scripts. The onboarding script now includes Gestures in its responsive and 200% text-size checks. Its 24 axe checks report no WCAG-tagged violations across setup/access and all ten dashboard views in light and dark themes. Physical gesture recognition remains a hands-on qualification task.

## Simplified profile, Docs and responsive speech, 11 October 2026

The current dashboard has Session and Tabs, with Controls, Permissions and Advanced in Profile. Docs is available only through the main website navigation at `/docs`. It lists all fifteen registered adapters, catalogue-derived command examples, per-site boundaries, the Jev and Groq routing layers, and the shared files in `extension/src/sites`.

Setup offers spoken help after five seconds and repeats once if unanswered. Existing microphone permission allows a spoken reply to enable step narration. Button and setting feedback stops narration and saves silent setup, including across reloads and replay. The silent-setting save waits until the native input event finishes so it cannot overwrite the same checkbox/radio selection. Read/Stop narration buttons are removed from onboarding. The browsing spoken-feedback preference remains separate.

Verification passes both TypeScript checks and production builds, the full 2,906-test extension suite plus 94 focused settings/background/permissions checks after adding the permission-return regression, 65 packaged Chromium scenarios, and both connected Next scripts. Twenty-four axe WCAG-tagged checks report zero violations: setup and permission handoff, all current dashboard settings views in both themes, and fully expanded Docs in both themes. Reflow passes at 320, 390, 768 and 1280 pixels and 200% text size. Desktop and mobile main-navigation Docs links pass. Screenshots of profile, Docs and its adapter/routing/source sections were inspected.

Audits wait for enabled, visible controls to finish their disabled-opacity transitions; controls inside collapsed disclosures are excluded from that settling wait, then opened for the appropriate view audit. Speech is stubbed to verify timing and routing. Real audible voice quality, microphone recognition and physical tracking remain manual qualification. No environment files, credentials, deployment or push changed in this task.

## Session tab list and navigation docs, 11 October 2026

The live open-tab list now appears only in Session. The separate Tabs view is removed; old `#tabs` links and "show tabs" open Session. Refresh, tab permissions and switching retain their behavior. "Move between pages" and its nine command examples are in the public Docs voice-command section.

Next typecheck and production build pass. The connected dashboard script verifies the Session tab list, refresh, old links, removed Tabs view and Docs command disclosure, alongside existing session/settings checks and responsive widths.

## Cleaner Session layout, 11 October 2026

Session uses compact Pointer and Voice activity panels, followed by a full-width Open tabs panel. Camera preview is collapsed until requested. Spoken help sits beside voice activity, tracking metrics remain optional, and the redundant Session navigation row is hidden. Punctuation-only final transcripts show the command prompt. Blocked or unavailable camera status offers an Open permissions action.

Both package typechecks and builds pass; 92 focused extension tests and the connected dashboard checks pass. Camera-preview browser checks now expand its disclosure first. Physical device access and recognition remain manual qualification.

## Profile width and Permissions consolidation, 11 October 2026

Profile now has Controls and Permissions. Message sending for testing, Activity & diagnostics and Run setup again are included below device access in Permissions. Legacy `#providers`, `#activity` and "open advanced" destinations still resolve to Permissions. Both Profile content stacks span the tab navigation width.

Next typecheck/build and both connected browser scripts pass. Profile checks verify two tabs and content width/alignment within two pixels of the tab bar. Existing responsive, setup replay and legacy navigation checks pass.
