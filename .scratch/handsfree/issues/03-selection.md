# 03: Select snapped targets deliberately

**What to build:** Outline and label page targets, then activate through confidence-gated dwell or a broad hand hold.

**Blocked by:** 01, 02.

**Status:** complete, reviewed

- [x] Overlay never intercepts page clicks and excludes itself from hit tests.
- [x] Dwell ring cancels on leave, loss, pause, and after activation until target exit.
- [x] Submit actions require separate confirmation; edge hold scrolls.

**Verification:** Extension TypeScript/build pass; automated unit/DOM and built-extension checks pass. Real-device reliability follows the laptop checklist, not an automated accuracy claim. See README.md, docs/testing.md, and docs/review.md for results and remaining manual evaluation.
