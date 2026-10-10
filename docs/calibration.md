# Comfortable pointer calibration

Calibration measures your movement area. It does not train a new face or hand model, and it does not use photos as a training dataset. The bundled MediaPipe model already detects face or palm landmarks locally. Calibration records how those landmarks move for you.

Start the session, choose Face or Hand, then select Calibrate in Pointer. There are five three-second captures: center, left, right, up and down. Hold each position shown by the prompt. Use your comfortable limit, even if it is only a small movement. Keep your wrist and fingers in frame for Hand. Do not stretch to the screen edges.

For each pose, the first 1.2 seconds let you settle. The remaining frames measure your position. At least eight reliable frames are needed per pose. A thumbnail is captured after reliable tracking has settled. The dashboard shows the five photos so you can see which poses were captured.

The center pose supplies your resting landmark position. Each directional pose supplies its distance from center. Left and right can have different ranges, as can up and down. Median measurements reduce the effect of isolated noisy frames. Resting jitter is measured separately; movements too close to that jitter are rejected with a direction-specific message.

Face mode uses those distances to calculate speed. A small turn left keeps the cursor moving left. Returning to center stops it at its current position. The dead zone keeps normal resting jitter from moving it. Sensitivity changes speed, and smoothing reduces abrupt motion.

Hand mode maps the measured palm movement area onto the full webpage. You only move within that small area. Hand sensitivity starts at 1.6×, so you can reach the screen edges before using the full measured range. Increase it to travel farther with less movement, or decrease it for more precision. You can rest your elbow on a support while keeping the palm visible. Holding still selects with the existing dwell or hand-hold timer; no pinch is required.

Pointing and dwell activation are disabled while calibration runs. Losing tracking freezes the cursor and blocks coordinate clicks. Voice scrolling remains available. Reliable saved settings can be reused next time, but recalibrate after changing your posture, camera angle or distance.

Only landmark measurements are saved locally for each mode. Thumbnails remain in session memory, are excluded from persisted session state and logs, never go to a provider, and clear when you stop or recalibrate. A failed new calibration preserves the earlier saved measurements. The dashboard camera preview uses website camera permission; extension tracking uses the extension's separate grant.
