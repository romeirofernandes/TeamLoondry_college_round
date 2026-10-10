# 05: Manage Chrome tabs by voice

**What to build:** Open/search/switch tabs, select by title, and confirm close-tab.

**Blocked by:** 01, 04.

**Status:** complete, reviewed

- [x] Optional tabs permission is requested through a user gesture only when needed.
- [x] Ambiguous title matches ask for a numbered choice; no-match does nothing.
- [x] New/background tabs, incognito, history, downloads, and settings commands work or report Chrome restrictions.

**Verification:** Extension TypeScript/build pass; automated unit/DOM and built-extension checks pass. Real-device reliability follows the laptop checklist, not an automated accuracy claim. See README.md, docs/testing.md, and docs/review.md for results and remaining manual evaluation.
