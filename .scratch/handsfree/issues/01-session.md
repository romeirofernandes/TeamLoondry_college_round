# 01: Start and stop a Chrome browsing session

**What to build:** Open the popup, launch a persistent control window, request media clearly, retain settings locally, and report protected pages.

**Blocked by:** None (can start immediately).

**Status:** complete, reviewed

- [x] Load an unpacked MV3 build with packaged scripts and matching theme.
- [x] Start, pause, resume, and stop propagate across the popup, controller, and page.
- [x] Permission denial leaves a voice-only path; no backend or OS actions.

**Verification:** Extension TypeScript/build pass; automated unit/DOM and built-extension checks pass. Real-device reliability follows the laptop checklist, not an automated accuracy claim. See README.md, docs/testing.md, and docs/review.md for results and remaining manual evaluation.
