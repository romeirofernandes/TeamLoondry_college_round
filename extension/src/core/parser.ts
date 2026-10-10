import type { Intent } from "../shared";

/** Normalize recognizer punctuation and spacing, without interpreting partial commands. */
export function normalizeSpeech(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[.!?,;:]+$/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

const fixed: Record<string, Intent> = {
  "scroll up": { type: "scroll", direction: "up" },
  "scroll down": { type: "scroll", direction: "down" },
  "go back": { type: "back" },
  back: { type: "back" },
  "go forward": { type: "forward" },
  forward: { type: "forward" },
  "click this": { type: "click" },
  click: { type: "click" },
  "open this": { type: "open" },
  "start typing": { type: "start-typing" },
  "stop typing": { type: "stop-typing" },
  "submit form": { type: "submit" },
  submit: { type: "submit" },
  pause: { type: "pause" },
  "pause handsfree": { type: "pause" },
  resume: { type: "resume" },
  "resume handsfree": { type: "resume" },
  "stop handsfree": { type: "stop" },
  confirm: { type: "confirm" },
  cancel: { type: "cancel" },
  "new tab": { type: "new-tab" },
  "open new tab": { type: "new-tab" },
  "next tab": { type: "next-tab" },
  "previous tab": { type: "previous-tab" },
  "close tab": { type: "close-tab" },
  "open incognito": { type: "incognito" },
  "open incognito window": { type: "incognito" },
  "open history": { type: "history" },
  "open downloads": { type: "downloads" },
  "open settings": { type: "settings" },
};

const numberNames = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

/** Only call in command mode. Dictation bypasses this parser altogether. */
export function parseIntent(text: string): Intent {
  const normalized = normalizeSpeech(text);
  if (Object.hasOwn(fixed, normalized)) return { ...fixed[normalized] };

  const selection =
    /^(?:choose|select|option) (\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)$/.exec(
      normalized,
    );
  if (selection) {
    const index = /^\d+$/.test(selection[1])
      ? Number(selection[1])
      : numberNames.indexOf(selection[1]) + 1;
    if (index >= 1 && index <= 10) return { type: "choose", index };
  }

  const namedTab = /^(?:go to (?:named )?tab|switch to tab|go to) (.+)$/.exec(
    normalized,
  );
  if (namedTab) return { type: "named-tab", name: namedTab[1] };

  const find = /^find (.+)$/.exec(normalized);
  if (find) return { type: "find", query: find[1] };

  const search =
    /^(background search|search in background|search)(?: for)? (.+)$/.exec(
      normalized,
    );
  if (search && search[2] !== "for")
    return {
      type: "search",
      query: search[2],
      background: search[1] !== "search",
    };

  return { type: "unknown", heard: text.trim() };
}
