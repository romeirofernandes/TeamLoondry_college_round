# Handsfree for Firefox

The Firefox package targets desktop Firefox 142 or later. Upload `firefix/releases/handsfree-firefox-0.1.0.zip` to Mozilla's Developer Hub. The separate `handsfree-firefox-0.1.0-source.zip` contains original code, lockfile, model inputs and assets for source review. This is an unsigned package; Mozilla signs it after validation and review. Temporary developer installation is available from `about:debugging` → This Firefox → Load Temporary Add-on.

This is an isolated Firefox fork. Source, dependencies, shared tracking code, branding, fonts, tests and packaging are all inside `firefix/`. It does not modify or build `extension/`, `next/` or the root shared modules.

## Build

Use Node.js 20.20 or newer and the system `zip` utility. From the source archive root:

```bash
cd firefix
npm ci
npm run build:firefox
```

The installable files are in `firefix/dist`. Zip their contents with `manifest.json` at the archive root. In the full repository, `npm run package:firefox` builds both upload and reviewer archives. The build always excludes `config/providers.local.json` and any private provider keys, even when that file exists locally. Model assets are bundled. The original model download procedure is in `firefix/scripts/assets.mjs`; the included assets already contain those inputs. MediaPipe WASM files come from the pinned npm dependency.

## Differences from Chrome

- Firefox uses a background event page and a visible Handsfree capture tab instead of an offscreen document. Keep the capture tab open, allow device access and return to your webpage. Stop or close capture to release devices.
- Camera tracking, hand gestures, typed commands, page controls, routines, tabs and the website dashboard use the same core implementation.
- The default dashboard is `http://localhost:3000/dashboard`. Run the Next website locally, or configure an existing hosted dashboard before distribution. A hosted URL is not embedded by this build.
- Firefox lacks the browser speech-recognition API used here. Open **Voice services** from the popup and enter your own Groq key for microphone transcription and prefixed Groq requests. Optionally enter an OpenRouter key for Jev command paraphrases. Stop and restart the session after configuring keys. Keys are stored locally and are never included in the upload archive.
- On-device Writing recognition/dictation and on-device language-pack installation are unavailable in Firefox. Writing never silently switches to cloud recognition. Setup choices can be completed with the keyboard; spoken setup replies require a configured Groq key and microphone access. Spoken output uses Firefox's system voices when available.
- Firefox internal pages and Mozilla Add-ons pages cannot use the pointer overlay. The browser downloads/history/settings commands open Firefox equivalents.
- This package targets desktop only; Android is not qualified.

## Data and review

The manifest declares browsing activity, website content, search terms and personal communications because optional configured cloud voice and command services can transmit those categories. With no provider keys, cloud services are inactive. Camera frames and tracking stay local. Microphone transcription uses Groq when enabled and configured; Jev uses OpenRouter/TypeSafe; prefixed page requests use Groq. Local provider configuration is never exported in this package. There is no analytics service.

A public privacy policy explaining these flows must accompany a listed submission. Use the above disclosure as the factual basis, then supply your policy URL and support details in Developer Hub. Mozilla still decides acceptance; local lint does not establish store approval.

Mozilla references: [submission](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/), [data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/), [signing](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

## Verification

Verified on Firefox 157 with disposable profiles and fake camera/microphone devices. The Firefox smoke check covers temporary installation, no bundled provider keys, camera worker startup, stable controlled-tab selection, typed scrolling/clicking, Pause/Resume and Stop releasing capture. All 2,920 unit tests pass. Mozilla `web-ext lint` reports zero errors and three warnings for existing static overlay/React `innerHTML` assignments; reviewers may inspect these. Physical head/hand accuracy, real microphone transcription, audible voice quality and Mozilla signing are not established by these checks.

To run Firefox checks on Linux, install Selenium and geckodriver in your test environment. Set `HANDSFREE_FIREFOX_TOOLS` to the directory containing its `package.json`, and `GECKODRIVER_PATH` to the driver binary:

```bash
HANDSFREE_FIREFOX_TOOLS=/tmp/handsfree-firefox-tools \
GECKODRIVER_PATH=/path/to/geckodriver \
npm run test:firefox
```

Generated `dist/`, downloaded model caches and dependencies are ignored. The upload ZIP and source-review ZIP in `releases/` are committed for download. This fork does not use a private provider configuration from the Chrome project.
