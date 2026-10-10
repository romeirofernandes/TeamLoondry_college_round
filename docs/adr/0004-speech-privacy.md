# Default to local speech and disclose browser-service speech

The spec's Web Speech API choice conflicts with its unconditional local-audio promise. Start in on-device-only mode and report unavailable language packs instead of silently using a remote recognizer. Users may explicitly choose browser-service speech after reading its audio notice. This preserves local privacy by default while allowing current Chrome installations with limited on-device speech support to test voice.

## Revised default, 2026-10-10

The user reported voice did not work and requested Jev command mapping plus Groq arbitrary commands. Browser-service speech is now the default with an explicit dashboard disclosure; Groq transcription is its cloud fallback. Local-only mode remains available and never falls back to cloud. Jev receives final command text, Groq arbitrary requests receive phrase and target labels, and Groq transcription receives utterance audio. Camera frames stay local.
