# 06: Find page targets with optional text-only LLM

**What to build:** Find arbitrary targets across the live DOM, highlight and scroll to matches, and ask on ties.

**Blocked by:** 03, 04.

**Status:** implemented, awaiting final review

- [x] Without a local key find reports disabled.
- [x] Only phrase, target text, and accessible names go to a fixed LLM provider.
- [x] Invalid results, timeout, ties, and no match never activate a target.

**Verification:** Extension TypeScript/build pass; automated unit/DOM and built-extension checks pass. Real-device reliability follows the laptop checklist, not an automated accuracy claim. See README.md and docs/testing.md.
