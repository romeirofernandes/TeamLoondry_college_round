# Handsfree Reliability and Comfort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Complete the eight requested command and comfort improvements.
**Architecture:** Keep Chrome offscreen capture, service worker routing, content runtime and Next dashboard. Use deterministic local commands before providers; expand Groq to bounded text assistance. Separate face rate control from hand absolute control.
**Tech Stack:** TypeScript, React, Next.js, Chrome MV3, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-10-10-handsfree-polish.md

## Global Constraints
- Preserve dwell defaults, timing, cancellation, confirmation gates, dictation isolation and protected-field checks.
- Camera frames remain local. Provider keys never enter tracked files, frontend bundles or logs. Use only the four working local Groq keys when present; ignore the fifth.
- Preserve existing offscreen capture and dashboard authorization boundaries; no backend or authentication.
- Exact local click/scroll/tab commands never depend on Jev or Groq; only final recognized transcripts activate commands.
- Provider answers and page text are data, rendered as text, never HTML or executable instructions.
- Work locally; no push or deploy. Physical camera/microphone performance must not be claimed from synthetic tests.

## Review Focus
- Pending provider request must not block a final click or pause; stale requests cannot execute after page changes.
- Ambiguous labels need disambiguation; regex characters in dictated labels must be treated literally.
- Page assistance must omit editable/secret regions and reject malformed provider results.
- Face rate movement must be frame-rate independent, stop at neutral, freeze on loss and avoid reacquisition jumps.
- Smooth scrolling must cancel on pause/loss and target nested scroll containers; thumbnail matching must respect occlusion.

### Task 1: Reliable final speech actions and Groq assistance

**Files:** Modify extension/src/core/parser.ts, providers.ts, background.ts, shared.ts, content/runtime.ts, content/dom.ts, content/overlay.ts; tests/core.test.ts, providers.test.ts, background.test.ts, content.test.ts. A focused new command/context helper file is allowed to keep responsibilities clear.
**Interfaces:** Retain parseIntent(text):Intent. Extend Intent with a local named target command (e.g. {type:'click-target',query:string}) and explicit page-context/answer messages as needed. Preserve existing protocol. Groq resolveArbitrary returns validated optional text answer alongside mutually exclusive action/IDs. Content exposes bounded safe page context and renders answers through textContent.
- [ ] Reproduce current failure: mapCommand unnecessarily calls provider for exact scroll/click and returns unknown on rejection; trace final transcript to HEARD to action and content execution. Add failing regression tests using the real router, parser and DOM where possible.
- [ ] Implement deterministic exact/anchored regex command dispatch before Jev. Cover polite scroll, click/open label, search query in new tab, suffix/prefix in background, next/previous/named tab. Treat labels literally, rank exact then whole-word/substring, exclude hidden/editable/private text; duplicate labels require choices. Existing submit checks still apply to named clicks.
- [ ] Ensure click and emergency commands can run while provider work is pending, while respecting dictation ordering and suppressing stale provider actions. Surface page dispatch errors instead of silently swallowing them. No interim activation.
- [ ] Extend wake routing to Groq page summaries/questions and general answers with bounded safe page text (maximum 12000 chars) and title/URL. Validate answer length (maximum 6000 chars), exclusive result shape, allowed action union/IDs. Show answer in overlay and feedback without HTML. No forced GET_TARGETS success for general questions.
- [ ] Add tests for provider unavailable exact commands, pending provider then click, named target ambiguity/regex literal, searched background tab, wake question answer, context privacy, malformed and stale provider result, dictation isolation.
- [ ] Run focused tests during iteration; run extension npm test and npm run typecheck before commit. Write report with RED/GREEN evidence and commit only task files.

### Task 2: Comfortable tracking and smooth page interaction

**Files:** Modify extension/src/tracking/math.ts, tracking/index.ts, shared.ts, background.ts setting normalization, content/dom.ts, content/runtime.ts; tests/tracking.test.ts, tracker-lifecycle.test.ts, content.test.ts. Focused scroll helper file allowed.
**Interfaces:** Settings adds scrollSensitivity:number (0.2–3 default 1), cursorStyle:'circle'|'arrow'|'crosshair'|'spark' (default circle). Face uses rate control; hand retains absolute mapping. Existing PointerSample stays unchanged. Sensitivity range 0.2–6 and dwell 400–5000ms validated in service worker, retaining defaults.
- [ ] Add failing tests for continued displacement with held face offset, neutral stopping without recenter, time-based movement, loss freeze/reacquisition and hand absolute mapping.
- [ ] Implement face rate control with comfortable calibrated offsets and bounded elapsed time, filtering velocity rather than recenter position. Reset timing on loss/pause. Improve calibration small-range acceptance and mode-specific guidance (comfortable small turns, no stretching; hand palm in frame). Preserve calibration safety and separate saved face/hand data.
- [ ] Add tests and implement thumbnail area snapping using actual usable descendant links/semantic card relationships, stable equivalent target handling and occlusion checks. Cover thumbnail plus title, nearby unrelated link and overlay obstruction. Preserve dwell gate semantics.
- [ ] Add tests and implement smooth command scroll and continuous frame-driven edge scroll, adjustable scrollSensitivity, nested scrolling, reduced-motion behavior and cancellation on pause/loss/leaving edge. Retain normal voice scroll commands.
- [ ] Extend settings defaults and persistence/validation bounds; normalize missing/invalid old values. Task 3 consumes these fields. Tests cover invalid saved settings and values at bounds.
- [ ] Run focused tests during iteration; run extension npm test and npm run typecheck before commit. Write RED/GREEN evidence and commit only task files.

### Task 3: Dashboard guidance and cursor choices with integration checks

**Files:** Modify next/components/dashboard/dashboard.tsx, next/app/dashboard/dashboard.css as needed, extension/src/content/overlay.ts, extension/src/ui/index.tsx if legacy controls expose the affected sliders, README.md, docs/testing.md; extend extension/tests/content.test.ts, extension.spec.ts/dashboard-next.mjs as appropriate.
**Interfaces:** Consume Task 2 Settings.scrollSensitivity and cursorStyle, updated sensitivity/dwell bounds. Apply cursor style to overlay without changing dwell ring, highlight or safety. Consume Task 1 answer feedback.
- [ ] Read next/AGENTS.md and relevant bundled Next docs before editing Next code. Use existing controls/style patterns; add accessible cursor choices circle/arrow/crosshair/spark, scroll speed, sensitivity 0.2–6, dwell 400–5000ms, with saved preferences.
- [ ] Explain face rate control (hold small turn to continue, neutral stops), low-effort calibration and hand setup (open palm, complete palm visible, comfortable range, steady dwell, recovery after loss) in dashboard, calibration instructions and README. Reflect Groq answers and deterministic local command examples; update privacy disclosure for page context.
- [ ] Render distinct cursor SVG/CSS icons through fixed trusted markup; dwell ring remains visible for every style and no arbitrary SVG/HTML input allowed. Add regression test for style changes preserving dwell.
- [ ] Add/run meaningful browser integration checks for transcript-to-scroll/click, named click, background search, tab switching, wake answer, explicit wake-prefixed named click, settings persistence and cursor choices. If Groq cannot express named clicks yet, extend its validated allowed intent schema/prompt to use the existing click-target query intent; find-only IDs retain highlight behavior and submit gates still bind. Use synthetic camera/mic where needed and disclose limits.
- [ ] Run extension typecheck, test, build and feasible Chrome browser tests; Next typecheck/build. Resolve platform-specific browser paths using installed Chrome, do not install a large browser unless necessary. Check responsive dashboard and accessibility for new controls if available.
- [ ] Document install/reload instructions and residual physical-device checks; write report with results, self-review, commit only task files.
