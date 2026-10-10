# 07: Inspect local runs and verify the extension

**What to build:** Keep bounded local event/run metrics, export/clear them, and provide repeatable fixtures and installation guidance.

**Blocked by:** 02, 03, 04, 05, 06.

**Status:** implemented, awaiting final review

- [x] Parser, safety, tracking mapping, tab selection, find ranking, and DOM behavior have meaningful tests.
- [x] Playwright loads the real built extension and exercises selection, dictation, pause, confirmation, and tab switching.
- [x] Spec conflicts, device checks, ADRs, and manual performance evaluation are documented honestly.

**Verification:** Extension TypeScript/build pass; automated unit/DOM and built-extension checks pass. Real-device reliability follows the laptop checklist, not an automated accuracy claim. See README.md and docs/testing.md.
