# Default to local speech and disclose browser-service speech

The spec's Web Speech API choice conflicts with its unconditional local-audio promise. Start in on-device-only mode and report unavailable language packs instead of silently using a remote recognizer. Users may explicitly choose browser-service speech after reading its audio notice. This preserves local privacy by default while allowing current Chrome installations with limited on-device speech support to test voice.
