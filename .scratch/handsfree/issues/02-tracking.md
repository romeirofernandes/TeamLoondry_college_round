# 02: Calibrate face and broad-hand cursor control

**What to build:** Use local MediaPipe face and hand landmarks to drive a calibrated in-page pointer.

**Blocked by:** 01: Start and stop a Chrome browsing session.

**Status:** implemented, awaiting final review

- [x] Worker tracking has a measured fallback, local models, and FPS/latency.
- [x] Neutral/range calibration, dead zone, One Euro smoothing, drift adaptation, recalibration, and sensitivity work.
- [x] Face leads, hand mode needs no pinch, and loss freezes the cursor.

**Verification:** Extension TypeScript/build pass; automated unit/DOM and built-extension checks pass. Real-device reliability follows the laptop checklist, not an automated accuracy claim. See README.md and docs/testing.md.
