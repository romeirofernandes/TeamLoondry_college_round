# 04: Navigate and dictate with voice safely

**What to build:** Run fixed commands, combine click-this with pointing, and dictate text without routing words to navigation.

**Blocked by:** 01, 03.

**Status:** complete, reviewed

- [x] Unknown speech is shown without action; stop typing is explicit.
- [x] Dictation inserts into supported fields; password/payment fields are guarded and submit is separately confirmed.
- [x] Pause stops voice and dictation; speech privacy and unavailable modes are explained.

**Verification:** Extension TypeScript/build pass; automated unit/DOM and built-extension checks pass. Real-device reliability follows the laptop checklist, not an automated accuracy claim. See README.md, docs/testing.md, and docs/review.md for results and remaining manual evaluation.
