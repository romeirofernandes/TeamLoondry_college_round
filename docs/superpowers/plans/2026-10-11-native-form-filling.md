# Native Form Filling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable safe, voice-only discovery, completion, review, and guarded submission of accessible web forms, with Google Forms as the first qualification target.

**Architecture:** Add a page-local form assistant alongside `ContentRuntime` and the existing site-specific executor. The shared assistant discovers controls from labels and form relationships, resolves a single explicit command at a time, executes and verifies locally, and owns its transient choices and confirmation. Deterministic parser intents route these commands directly to the active page; the LLM route is not involved in form writes.

**Tech Stack:** TypeScript, Chrome extension content scripts, DOM accessibility semantics, existing voice parser/runtime and overlay.

**Spec:** `docs/superpowers/specs/2026-10-11-native-form-filling-design.md`

## Global Constraints

- Support only visible, enabled, editable controls exposed in the permitted page/frame DOM.
- Block password, one-time-code, payment/card/bank, government identifier, and medical/health fields; when uncertain, leave the control untouched.
- Never invent or infer answers; accept one explicit value or option per command.
- Keep form discovery, matching, validation, and verification local; never send form DOM, answer values, or validation text to an LLM.
- Never persist answer values or include labels/values in telemetry; retain values only in the page and transient in-memory verification.
- Redact form-command and dictation transcript text before it enters persisted session state; ephemeral on-page transcript display may remain local to the active interaction.
- Require a fresh explicit confirmation before final submission; attempt submission at most once per confirmation and never retry an uncertain outcome automatically.
- Preserve current face/hand controls, literal dictation, site adapters, and their existing write/publish/booking guards.
- Do not add or run tests; validate changes with extension typecheck/build and report that live form qualification still requires user/browser verification.

## Review Focus

- Google Forms groups and section containers can be `role`-based rather than native `<form>` controls; discovery must scope answers to the right question and section.
- A field may be sensitive because of its group label, description, autocomplete, or surrounding question even when its own `name` and `id` look ordinary; ambiguous classification must block it.
- Same-named fields/options can appear more than once; numbered choices must expire on structural mutation, navigation, or target change.
- React-controlled and custom accessible controls may revert synthetic changes; only report success after reading the expected state back.
- A submit click may navigate, show an error, or leave an indeterminate remote result; confirmation cannot be reused and automatic retries are forbidden.

---

## File map

- Create `extension/src/content/forms.ts`: local control discovery, accessible labels, safety classification, form model, form session/choice state, exact field operations, section progression, review, and guarded submit confirmation.
- Modify `extension/src/shared.ts`: discriminated `FormCommand` intent shape used across the extension message boundary.
- Modify `extension/src/core/parser.ts`: deterministic patterns for the approved form command catalogue, including values/options and ordinals.
- Modify `extension/src/background.ts`: route form intents to the active page directly and include them in dictation/command gating without sending them to arbitrary LLM matching.
- Modify `extension/src/content/runtime.ts`: instantiate the assistant, dispatch form intents, bridge literal dictation and confirm/cancel, clear form state on page changes, and preserve existing site adapter priority.
- Modify `extension/src/content/overlay.ts` only if needed to render bounded local review/choice feedback without exposing form contents to remote or persistent state.

## Interfaces

- `FormCommand` is a discriminated union with command names `list-forms`, `select-form`, `list-fields`, `list-required`, `fill`, `change`, `dictate`, `select-option`, `check`, `uncheck`, `clear`, `choose`, `missing`, `review`, `next-section`, `previous-section`, and `submit`; only applicable commands carry `query`, `value`, `option`, or `index`. `confirm` and `cancel` reuse the existing top-level `Intent` variants.
- Task 1 creates `FormModel.discover(): FormInventory`, `FormModel.control(id): FormControl | undefined`, and `FormModel.refresh(): FormInventory`. `FormInventory` contains visible form roots and structural signatures; `FormControl` contains a document-bound ID, element, accessible name/type, safe-state flags, option labels, and completion status, never a serialized answer value.
- Task 3 creates `FormAssistant.handle(command: FormCommand): Promise<FormResult>`, returning `{ handled: boolean; feedback?: string; dictationTarget?: HTMLElement; dictating?: boolean }`. `handled: false` means the page has no applicable safe form context; blocked/ambiguous work is handled and returns explanatory feedback without mutation.
- Task 3 creates `FormAssistant.cancel(reason?: string): void` to clear transient field/form choices and pending submit confirmation; `pageChanged(): void` also clears the selected form and document-bound handles; `confirm(): Promise<FormResult>` consumes one unexpired pending submit confirmation and makes no more than one submit attempt.

## Tasks

### Task 1: Build the page-local form model and safety boundary

**Files:**
- Create `extension/src/content/forms.ts`
- Read/integrate existing helpers from `extension/src/content/dom.ts` and `extension/src/sites/resolver.ts`

**Deliverable:** A deterministic `FormModel` inventory of visible forms and controls with per-document identity, accessible name, type, required/disabled/read-only status, option labels, completion status, and sensitivity result. Support native `<form>` and accessible `[role="form"]` roots, with a document-level fallback only when controls belong to one unambiguous form group. Use associated labels, `aria-labelledby`, `aria-label`, fieldset/legend, visible question/container text, and placeholder in that order. Exclude controls without a safe, usable name.

- [ ] Implement `FormModel.discover()`, `control(id)`, and `refresh()` plus an internal structural signature that ignores ordinary value edits but changes for target, label, option, visibility, disabled/read-only, section, or navigation changes.
- [ ] Implement sensitivity classification using the control and associated question/group context; classify unknown or conflicting signals as blocked.
- [ ] Limit supported editable controls to text, email, telephone, URL, number, search, textarea, supported date/time inputs, native select, accessible combobox, radio group, and checkbox.
- [ ] Return only bounded labels/types/completion metadata to callers; never serialize answer values into diagnostic or stored objects.

### Task 2: Add deterministic command parsing and page routing

**Files:**
- Modify `extension/src/shared.ts`
- Modify `extension/src/core/parser.ts`
- Modify `extension/src/background.ts`

**Deliverable:** Every command below is recognized locally and routed as a form intent without an LLM/provider request. Value and option phrases are preserved literally after removing only the command framing.

- [ ] Add the `FormCommand` union and top-level `{ type: "form-command"; command: FormCommand }` intent.
- [ ] Parse: “list forms”; “open/select form [number/name]”; “list fields”; “list required fields”; “fill [field] with [value]”; “enter [value] in [field]”; “change [field] to [value]”; “dictate into [field]”; “select [option] for [field]”; “choose [option] for [question]”; “check/uncheck [field]”; “clear [field]”; “choose [number]”; “what fields are missing”; “review my answers”; “next/previous section”; and “submit form”. Existing “confirm” and “cancel” intents are dispatched to the form assistant only when it owns the pending operation.
- [ ] Keep explicit form commands out of arbitrary-find/LLM handling and route them only to the active target tab's `PAGE_ACTION`.
- [ ] Preserve current wake phrase, dictation mode, pause/resume, and gesture/head/hand message routing.

### Task 3: Implement field selection, edits, choices, and literal dictation

**Files:**
- Modify `extension/src/content/forms.ts`
- Modify `extension/src/content/runtime.ts`

**Deliverable:** A user can find a form and perform exactly one unambiguous field edit per command; successful edits are verified from the resulting DOM state.

- [ ] Implement form listing/selection, field listing, required-field listing, and bounded numbered choices whose handles expire on structural changes.
- [ ] Add `FormAssistant.handle()`, `cancel()`, `pageChanged()`, and `confirm()` over the Task 1 `FormModel` interfaces.
- [ ] Implement fill/replace/clear for supported text and date/time controls with native prototype setters, bubbling input/change events, focus behavior, and value readback.
- [ ] Implement exact unique native select/combobox option selection and radio/checkbox state changes; use only a currently present, uniquely resolved option.
- [ ] Reuse the existing `DICTATE` insertion path for “dictate into [field]”; refactor `start-typing` into a helper that can receive a resolved safe field while preserving “stop typing”, focus-loss cancellation, and paused-state behavior.
- [ ] On duplicate names or options, announce a bounded numbered list and require “choose [number]”; on a stale number, explain that the list changed and make no change.

### Task 4: Add form progression, review, and guarded submission

**Files:**
- Modify `extension/src/content/forms.ts`
- Modify `extension/src/content/runtime.ts`
- Modify `extension/src/content/overlay.ts` only if a local review surface is needed

**Deliverable:** Multi-section forms can be completed and corrected safely; submission requires confirmation bound to the unchanged active form and target.

- [ ] Implement missing-required and visible-validation summaries using page evidence only; do not announce values by default.
- [ ] Implement next/previous section controls with section rescan and refreshed form handles after navigation.
- [ ] Implement “review my answers” as a local review of safe fields, with spoken feedback limited to field names/status unless the user specifically asks for a value.
- [ ] Implement “submit form” preview and a short-lived pending confirmation bound to tab/document/form/submit control/action/method/structural revision; cancel it on mutation, page change, expiry, or target mismatch.
- [ ] Consume confirmation before submitting so it cannot be reused; verify a success state, destination, or newly submitted result. Report uncertainty honestly and never retry automatically.
- [ ] Route `confirm`/`cancel` to an existing specialized site workflow first when one owns a pending action; generic form handling must not bypass any adapter guard.

### Task 5: Integrate lifecycle protections and qualify the feature

**Files:**
- Modify `extension/src/content/runtime.ts`
- Modify `extension/src/background.ts` only for lifecycle routing if required

**Deliverable:** Form commands remain independent of gestures and site-specific commands, and form state is invalidated safely.

- [ ] Clear form choices and confirmation on tab/document/page navigation, pause, stop, cancellation, or adapter takeover; do not clear the currently edited page values.
- [ ] Ensure the generic assistant declines to handle actions on pages where a registered adapter owns the form/write workflow.
- [ ] Run `npm run typecheck` and `npm run build` in `extension/`; fix all errors without running or adding tests.
- [ ] Provide a concise manual qualification checklist for one Google Form, one plain HTML form, duplicate labels/options, a blocked sensitive field, a multi-section form, invalid submission, and existing site-specific write workflows. Do not claim live qualification until the checklist is exercised in the user's browser.

## Acceptance mapping

- Form/field inventory and numbered ambiguity: Tasks 1–3.
- Literal value entry, correction, clearing, choices, and verification: Tasks 2–3.
- Required state, multi-section progression, and review: Task 4.
- Sensitive-field block, local-only value handling, and submit confirmation: Tasks 1 and 4.
- Existing adapter/gesture/head/hand protection and lifecycle invalidation: Tasks 2 and 5.
- Google Forms and generic accessible forms: Tasks 1–5; live qualification checklist in Task 5.
