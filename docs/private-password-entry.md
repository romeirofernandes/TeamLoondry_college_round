# Silent password entry

## Use the private keyboard

1. Reload the unpacked extension from `extension/dist` in `chrome://extensions`, then refresh your webpage. Start Handsfree with head or hand pointing enabled and calibrated.
2. On an HTTPS login page, point at the password field and dwell. Alternatively, before focusing the field, say **“open private keyboard”**, **“show password keyboard”**, or **“private keyboard”**.
3. Password focus switches off recognition and microphone recording, clears Handsfree transcripts, cancels pending provider work and pauses routines. Keys stay locked until microphone shutdown is acknowledged. A pending microphone permission prompt must finish before keys unlock.
4. Select letters, numbers, **Shift**, **Symbols**, **Space**, **Backspace** or **Clear** with your usual head/hand pointer and dwell. Move away from a key before selecting it again. Physical mouse/keyboard activation of these controls also works.
5. **Done** or **Close** retains the password and does **not** submit the login form. Choose **Resume voice** explicitly when finished. Then use normal login/form commands; existing submission rules still apply.

If there are multiple password inputs, point at the required input before entering private mode, or choose a labelled password field from the private panel. Voice stays off when changing tabs, changing settings, pausing/resuming, stopping/restarting or closing the keyboard. Routine recording/playback remains paused until explicitly resumed after private entry.

## Use Chrome's saved-password popup (optional macOS companion)

The webpage extension cannot click Chrome-owned autofill UI. This feature uses the existing Handsfree native Mac pointer instead; it does not read saved passwords or enumerate accounts.

1. Build/run the updated desktop companion and pair it with the extension using the existing Browser connection setup. Calibrate a selected head/hand input in desktop settings and allow native control access. The current native companion targets macOS 26+ on Apple Silicon.
2. From the private panel choose **Control password popup**. Handsfree shuts down its browser capture and transfers control to the desktop companion. Native speech stays disabled, including when voice is normally selected in preferences.
3. Use the system pointer to click your password field and select the desired Chrome/password-manager suggestion. During this private session, holding still for 1.2 seconds clicks. No account selection, password extraction or authentication approval is automatic.
4. Choose **Return to browser** in the desktop panel. The native camera is released before the extension reclaims it. Voice remains off; finish the private keyboard if open, then select **Resume voice**.

Missing calibration, access, connection, a stale session or a timeout fails closed. Stop remains available. Touch ID, master-password and operating-system authentication prompts still require your usual authentication method.

## Privacy and support boundaries

- Handsfree does not save, log, speak or send keyboard characters/passwords to AI services, routines or the native bridge. It writes directly to the exact chosen password input, using ordinary input/change events with no character payload.
- The destination website receives the password normally and can read its own password field. The closed keyboard shadow tree prevents ordinary Handsfree scans from collecting its keys; it is not protection from a malicious website.
- Already-transmitted speech cannot be recalled. Never speak a password; wait for the panel to report **Microphone off** before entering one.
- Supported initially: ordinary top-level `input[type=password]` fields on HTTPS, plus localhost fixtures. Embedded frames, closed shadow components, payment fields and one-time-code fields are not supported by this keyboard. No passkey or password-manager account is required.
- The keyboard offers Latin letters, digits, spaces and common punctuation. Browser autofill can still fill other existing passwords through native control.

## Local verification

Use dummy credentials on a test form. Check that a held dwell inserts once; move away/re-enter to repeat; Shift/Symbols work; Clear empties; Done/Close never submit. Inspect the masked field and verify the microphone is off. Change tabs or settings and confirm voice stays off. Resume explicitly, then check normal pointing, voice and routine commands.

Automated coverage includes real packaged Chromium keyboard/dwell edits, a sentinel absent from extension storage/outgoing fixture requests, speech startup cancellation, provider/command gates, worker restoration, field invalidation, native lifecycle epochs, camera-before-return ordering and compact-panel layout. The native UI tests use deterministic camera/Tauri fixtures. A real Chrome credential popup and physical head/hand tracking require qualification on the target Mac; they are not claimed verified by the fixture tests.
