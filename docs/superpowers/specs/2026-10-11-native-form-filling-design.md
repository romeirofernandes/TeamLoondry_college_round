# Native Form Filling Design

**Status:** Proposed for implementation planning
**Date:** 2026-10-11
**Approved direction:** Shared semantic form support; sensitive fields blocked; final submissions require explicit confirmation.

## Goal

Let a user complete ordinary, visible web forms by voice without positioning the pointer or requiring a separate adapter for each website. Google Forms is a first qualification target. The system must identify fields from their labels, accept only values the user provides, verify each change, and require a separate confirmation before final submission.

“Any form” means forms whose controls are exposed through the accessible DOM in a permitted page/frame. It does not mean bypassing browser security, CAPTCHA, authentication, or inaccessible custom widgets. Handsfree must report these limits clearly.

## Current baseline

- Handsfree has a global “start typing” flow for literal dictation into the selected editor and a generic final-submit confirmation.
- The site executor supports a small set of typed field and select operations, mostly through site-specific adapters. Existing workflows include site-specific forms such as IRCTC and GitHub.
- There is no shared form inventory, field-by-label operation, generic choice-group controller, required-field summary, or form review workflow.
- Preserve site-specific adapters for specialized or consequential workflows. The shared form engine must not bypass their validations or publication/booking guards.

## Approach

Use one shared semantic form engine. It discovers visible controls, builds a local form model from accessible labels and relationships, resolves spoken field/option names against that model, executes a bounded change, and verifies the resulting DOM state. Existing site adapters retain priority for their specialized actions.

This avoids per-website calibration and avoids sending page contents to an LLM for control decisions. A site-specific fallback can be added later only when a real custom widget cannot be operated through the shared semantic model.

## Scope

### Included in the first release

- Text, email, telephone, URL, number, search, and multiline text fields.
- Accessible select/combobox controls, radio groups, and checkboxes.
- Date and time fields where the page exposes a supported accessible input and a parseable format.
- Multiple visible forms: enumerate and select a form before editing when the target is ambiguous.
- Required-field discovery, validation feedback, value correction/clearing, multi-section navigation, answer review, and guarded final submission.
- Google Forms as the first live target, plus generic accessible HTML form fixtures and at least one non-Google site.

### Excluded or blocked

- Passwords, one-time codes, payment/card or bank details, government identifiers, and medical/health fields are blocked with a clear reason. There is no voice override.
- File uploads, CAPTCHA, browser-owned dialogs, authentication challenges, closed shadow DOM, and controls that provide no accessible or visible label are not supported in the first release.
- No profile autofill, generated answers, inferred values, multi-field batch guessing, or automatic form submission.
- No raw form values, option selections, or page text in analytics, diagnostic logs, provider prompts, or stored settings.

If the sensitivity classifier cannot determine whether a field is safe, it leaves the field untouched and asks the user to handle it manually.

## Form model and resolution

The form model contains only the active form's visible, enabled, editable controls. Each field records a per-document identity, accessible name, type, required/disabled/read-only state, option labels, and a revision-bound handle. Current values may be read transiently from the page to verify an edit, but must not be copied to persistent storage, diagnostics, or remote services. Labels are resolved in this order: associated `<label>`, `aria-labelledby`, `aria-label`, fieldset/legend relationship, visible question/container text, placeholder, then a clearly reported unnamed-control fallback.

Repeated labels and ambiguous options produce a numbered list. A number refers only to the most recently announced list and expires when the form changes. The executor must scope all changes to the selected form and recheck field identity, enabled state, current value, options, and page revision immediately before applying them.

Values are supplied literally by the user. For choice fields, the engine must choose an option present in the current form. If the phrase is not an exact or uniquely grounded match, it asks the user to choose from announced options. React-controlled fields must receive the site's expected input/change events and be verified by reading the resulting state.

## Command catalogue

Commands below apply to the active page. If more than one form or control matches, Handsfree announces choices and waits for a numbered selection.

| Command | Result |
| --- | --- |
| “List forms” | Announce visible forms, numbered when needed. |
| “Open form two” / “Select the registration form” | Bind the current form session to that form. |
| “List fields” | Announce field names and control types in the selected form. |
| “List required fields” | Announce required fields and whether each is completed. |
| “Fill email with gavin@example.com” | Put the explicit value in the uniquely matched field and verify it. |
| “Enter [value] in [field]” | Equivalent field-by-name fill command. |
| “Change [field] to [value]” | Replace that field's current value and verify the change. |
| “Dictate into [field]” | Focus the field and begin literal dictation; “Stop typing” exits dictation. |
| “Select [option] for [field]” | Choose a unique existing dropdown/combobox option. |
| “Choose [option] for [question]” | Select a unique radio option for that question. |
| “Check [checkbox]” / “Uncheck [checkbox]” | Set and verify the requested checkbox state. |
| “Clear [field]” | Clear the uniquely matched safe field. |
| “Choose two” | Select the second item in the current announced list. |
| “What fields are missing?” | Report empty required fields and visible validation errors. |
| “Review my answers” | Show a local review of safe fields before submission. Spoken feedback defaults to field names and completion status; it reads answer values aloud only when the user specifically asks. |
| “Next section” / “Previous section” | Navigate a multi-section form and refresh the form model. |
| “Submit form” | Prepare a summary of the selected form and ask for confirmation. |
| “Confirm” / “Cancel” | Submit once / cancel the pending submission. |

The first release fills one value per voice command. Multi-field batch instructions are deferred until single-field matching, dictation, and correction are reliable.

## Confirmation and verification

- Filling a field, changing a choice, or clearing a field is an explicit page write. Each action must be uniquely resolved and verified; ambiguous actions do not execute.
- Navigation between non-final form sections can proceed without submission confirmation, but the system must re-scan and revalidate fields after each transition.
- Final submission always requires a separate “confirm” within a short expiry window. The preview names the form/site and reports a concise completion summary without reading answer values aloud by default; it excludes blocked fields and does not transmit answer values elsewhere.
- Confirmation is bound to the same tab, document, form, submit control, form action/method, and unchanged revision. A page/form/target change cancels the pending submit.
- Click/spinner alone is not success. Verify a visible success state, next destination, or one new submitted response/result. If success cannot be established, report uncertainty and never retry automatically. The engine guarantees at most one submit attempt per confirmation; it cannot guarantee that a remote site processed an attempt exactly once if the site outcome is indeterminate.
- Cancellation clears pending work. Completed field edits remain in the page unless the user asks to clear them.

## Privacy and failure behavior

Form discovery, matching, validation, and verification run locally in the content script. No form DOM, answer values, or validation text are sent to the language model. Voice transcription continues to follow the user's configured speech-recognition mode; the form engine must not add a separate provider request. Diagnostics may record action IDs, outcome states, durations, and counts, but not labels or values.

For unavailable, ambiguous, blocked, stale, or unverifiable operations, Handsfree says what it found and what to do next. It must not silently substitute another field or option. “Cancel” and “stop typing” remain available during the flow; dictation remains literal until stopped.

## Implementation sequence

1. **Form discovery:** introduce a local form/field model, sensitivity classification, visible-control filtering, and field/form listing with numbered choices.
2. **Field operations:** add text fill, replacement, clear, literal dictation, select/combobox, radio, checkbox, and supported date operations with state verification.
3. **Form progression:** implement required-field/missing-field reporting, correction, validation messaging, and multi-section navigation with re-discovery after transitions.
4. **Review and submit:** implement local answer review, revision-bound confirmation, at-most-once submission attempts, and post-submit verification.
5. **Qualification:** exercise the command catalogue on Google Forms, generic accessible forms, an ordinary non-Google form, and existing specialized workflows to ensure their guards remain in force.

Each stage should have automated unit/DOM coverage and a manual voice-only qualification checklist. Browser build/type checks alone do not qualify a real website. Do not advertise broad “any form” support until the supported journeys pass.

## Acceptance criteria

1. A user can list and select a visible form without pointer placement.
2. A uniquely named supported field can be filled, changed, cleared, or dictated into using only voice; the page's actual value is verified.
3. Native select, radio, checkbox, and supported date controls only accept options/states present in that form.
4. Duplicate field/option matches yield numbered choices; stale numbers cannot act on a changed form.
5. Required and validation states are reported from page evidence; no answer is invented.
6. Sensitive fields are consistently blocked and their values are neither read aloud nor logged/transmitted by the form engine.
7. Final submission cannot happen before a fresh explicit confirmation and is attempted at most once per request.
8. Unverified submission outcomes are reported honestly and are not retried automatically.
9. Existing face/hand controls and specialized site workflows retain their current routes and protections.
10. Google Forms and generic accessible form journeys work from voice input without site-specific calibration.

## Open implementation decision

The current site executor binds requests to a site snapshot revision. Implementation must distinguish form-structure changes from ordinary answer edits so entering the first answer does not stale every later command, while any structural/target change still invalidates pending choices and submission confirmation. Keep answer text local and exclude it from telemetry signatures that may be exported.
