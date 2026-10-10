# Handsfree command reliability and comfortable control

User request on 2026-10-10 is the binding spec. Improve the existing Chrome MV3 extension and Next dashboard, retaining the architecture documented in README.

## Outcomes
1. Accurate final transcripts execute supported browser commands. Exact/regex local commands must bypass provider latency and failure. Click the current target promptly; named click/open must match real page labels locally and ask for numbered choice on ambiguity. Search/new-tab requests retain their query and background intent. Tab switching works.
2. Hey handsfree routes to Groq for actions, page summaries, page questions and general questions. Explicit wake-prefixed click/open requests for named controls execute through the same local matching and confirmation gates; find-only requests highlight. Text answers appear in the passive webpage overlay and dashboard feedback. Page context is bounded public document text, excluding inputs, editable regions, passwords, scripts and Handsfree UI. No page scripts execute from provider output. Stale results cannot act after pause/navigation/stop. Existing submit/close confirmations remain.
3. Face movement acts as comfortable rate control: holding a small directional offset keeps moving; neutral stops, without snapping back. Hand retains direct pointing. Small comfortable calibration movements suffice. Tracking loss freezes movement/activation; reacquisition must not jump.
4. YouTube thumbnail/title areas resolve to their actual clickable link without inventing click areas behind overlays. Keep target snapping stable while traversing a thumbnail. Existing dwell timing, visible ring, cancellation and rearm behavior remain.
5. Smooth voice scrolling and continuous edge scrolling with adjustable speed. Avoid repeated large scroll jumps. Respect reduced motion. Stop all scrolling on pause/stop, and edge scrolling on tracking loss or leaving the edge; explicit voice scroll works before pointer calibration. Handle scrollable containers.
6. Expand pointer sensitivity to 0.2–6 and dwell duration to 400–5000ms without changing default 800ms. Add scrollSensitivity 0.2–3 default 1, cursorStyle circle/arrow/crosshair/spark default circle. Persist and validate settings; reflect in dashboard and overlay.
7. Dashboard explains face rate control, neutral stopping, comfortable calibration, hand framing/palm movement/hold selection and recovery, and offers cursor choices and scroll speed.

## Global Constraints
- Preserve dwell defaults, timing, cancellation, confirmation gates, dictation isolation and protected-field checks.
- Camera frames remain local. Provider keys never enter tracked files, frontend bundles or logs. Use only the four working local Groq keys when present; ignore the fifth.
- Preserve existing offscreen capture and dashboard authorization boundaries; no backend or authentication.
- Exact local click/scroll/tab commands never depend on Jev or Groq; only final recognized transcripts activate commands.
- Provider answers and page text are data, rendered as text, never HTML or executable instructions.
- Work locally; no push or deploy. Physical camera/microphone performance must not be claimed from synthetic tests.

## Approved follow-up: generic voice navigation
User approved generic positional/named page targeting, search-result links and fields, background opening and Jev key rotation. No per-website calibration or adapters in this increment. Head/hand/calibration/dwell behavior must remain unchanged. Extend existing semantic DOM page targets and safety gates; all exact commands run locally. Opening links in new/background tabs must validate http(s), sender/current page and cancellation. Sensitive/editable fields retain protection; focus never types/submits. Existing Groq answers/search/tab navigation remain.
