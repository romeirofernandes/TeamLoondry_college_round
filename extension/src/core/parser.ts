import type { Intent, Settings } from "../shared";

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
  "show links": { type: "show-links" },
  "scroll up": { type: "scroll", direction: "up" },
  "scroll down": { type: "scroll", direction: "down" },
  "go back": { type: "back" },
  "previous page": { type: "back" },
  "go to previous page": { type: "back" },
  back: { type: "back" },
  "go forward": { type: "forward" },
  forward: { type: "forward" },
  "click this": { type: "click" },
  "click here": { type: "click" },
  "click that": { type: "click" },
  "click it": { type: "click" },
  click: { type: "click" },
  "open this": { type: "open" },
  "start typing": { type: "start-typing" },
  "stop typing": { type: "stop-typing" },
  "finish dictation": { type: "stop-typing" },
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
  "close this tab": { type: "close-tab" },
  "close the current tab": { type: "close-tab" },
  "show tabs": { type: "show-tabs" },
  "list tabs": { type: "show-tabs" },
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
const ordinalNames = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "thirteenth",
  "fourteenth",
  "fifteenth",
  "sixteenth",
  "seventeenth",
  "eighteenth",
  "nineteenth",
  "twentieth",
];
const tabNumberNames = [
  ...numberNames,
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
];

/** Session controls are exact and available even during dictation and pause. */
export function sessionIntent(text: string, settings: Settings): Intent | null {
  const normalized = normalizeSpeech(text);
  if (normalized === settings.pausePhrase) return { type: "pause" };
  if (normalized === settings.resumePhrase) return { type: "resume" };
  const intent = fixed[normalized];
  return intent && ["pause", "resume", "stop"].includes(intent.type) ? { ...intent } : null;
}

export function wakeRequest(text: string): string | null {
  const match = /^(?:hey|hello|okay|ok)[\s,]+hands?[\s-]*free\b[\s,:.!-]*(.*)$/i.exec(text.trim());
  return match ? match[1].trim() : null;
}

/** Only call in command mode. Dictation bypasses this parser altogether. */
export function parseIntent(text: string): Intent {
  const normalized = normalizeSpeech(text).replace(/^(?:(?:could|can|would) you )?(?:please )?/, "").replace(/ please$/, "");
  const pointer = /^(?:use|switch to) (?:the )?(head|face|hand|hands)(?: (?:pointer|control))?$/.exec(normalized);
  if (pointer) return { type: "switch-pointer", mode: /^(head|face)$/.test(pointer[1]) ? "face" : "hand" };
  if (/^(?:(?:open|create|make)(?: me)? )?(?:a |another )?(?:new|fresh|blank) tab$/.test(normalized)) return { type: "new-tab" };
  const endScroll = /^(?:scroll|go|move|jump)(?: all the way)? to (?:the )?(top|bottom)(?: of (?:the |this )?page)?$/.exec(normalized);
  if (endScroll) return { type: "scroll", direction: endScroll[1] as "top" | "bottom" };
  if (/^(?:play|resume)(?: (?:the |this )?(?:video|movie|music|song|playback))?$/.test(normalized) && normalized !== "resume") return { type: "media-play" };
  if (/^(?:pause|stop) (?:the |this )?(?:video|movie|music|song|playback)$/.test(normalized)) return { type: "media-pause" };
  if (/^(?:toggle playback|play or pause|pause or play)$/.test(normalized)) return { type: "media-toggle" };
  const seek = /^(?:(?:skip|seek|fast) )?(forward|backward|back|rewind|fast forward)(?: (?:by )?(\d{1,3}|ten|five|thirty)(?: seconds?)?)?(?: (?:in |of )?(?:the |this )?(?:video|movie|song))?$/.exec(normalized);
  if (seek && normalized !== "forward" && normalized !== "back") {
    const amount = seek[2] ? ({ ten: 10, five: 5, thirty: 30 }[seek[2]] ?? Number(seek[2])) : 10;
    if (amount > 0 && amount <= 600) return { type: "media-seek", seconds: /forward/.test(seek[1]) ? amount : -amount };
  }
  const politeScroll = /^(?:(?:could|can|would) you )?(?:please )?scroll (up|down)(?: please)?$/.exec(normalized);
  if (politeScroll) return { type: "scroll", direction: politeScroll[1] as "up" | "down" };
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

  const adjacentTab = /^(?:(?:switch|go|move)(?: over)? to (?:the )?)?(next|previous|last) tab$/.exec(normalized);
  if (adjacentTab) return { type: adjacentTab[1] === "next" ? "next-tab" : "previous-tab" };

  const tabPosition = /^(?:(?:switch|go|move)(?: over)? to (?:the )?(?:tab )?(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth)(?:st|nd|rd|th)?(?: tab)?|(?:switch|go|move) tab (\d{1,3}))$/.exec(normalized);
  if (tabPosition) {
    const value = tabPosition[1] ?? tabPosition[2];
    const index = /^\d+$/.test(value)
      ? Number(value)
      : ordinalNames.includes(value)
        ? ordinalNames.indexOf(value) + 1
        : tabNumberNames.indexOf(value) + 1;
    if (index >= 1 && index <= 999) return { type: "indexed-tab", index };
  }

  const tabSuffix = /^(?:switch|go|move) to (?:the )?(.+?) tab$/.exec(normalized);
  if (tabSuffix) return { type: "named-tab", name: tabSuffix[1] };
  const namedTab = /^(?:go to (?:the |named )?tab|switch to (?:the )?tab|switch to|go to) (.+)$/.exec(
    normalized,
  );
  if (namedTab) return { type: "named-tab", name: namedTab[1] };

  const find = /^find (.+)$/.exec(normalized);
  if (find) return { type: "find", query: find[1] };

  const search = /^(background search|search in (?:the )?background|in (?:the )?background search|search)(?: for)? (.+)$/.exec(normalized);
  if (search) {
    let query = search[2];
    let background = search[1] !== "search";
    if (/ in (?:the )?background$/.test(query)) {
      background = true;
      query = query.replace(/ in (?:the )?background$/, "");
    }
    query = query.replace(/ in (?:a |the )?new tab$/, "");
    if (query && query !== "for") return { type: "search", query, background };
  }

  const navigation = normalized.replace(/^(?:(?:could|can|would) you )?(?:please )?/, "").replace(/ please$/, "");
  const focus = /^focus (?:on )?(?:the )?(.+)$/.exec(navigation);
  if (focus) return { type: "focus-target", query: focus[1].replace(/^search (?:box|field)$/, "search") };
  if (navigation === "show links" || navigation === "show the links") return { type: "show-links" };
  const suffix = / in (?:(?:a|the) )?(background(?: (?:new )?tab)?|new tab)(?: in (?:the )?background)?$/.exec(navigation);
  const disposition = suffix ? (suffix[1].startsWith("background") || suffix[0].endsWith("background") ? "background" : "new-tab") as "background" | "new-tab" : undefined;
  const command = suffix ? navigation.slice(0, suffix.index) : navigation;
  const ordinal = /^(?:click(?: on)?|open) (?:the )?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|[1-9](?:st|nd|rd|th)?|10(?:th)?) (?:link|result)$/.exec(command);
  if (ordinal) {
    const names = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
    const index = /^\d/.test(ordinal[1]) ? parseInt(ordinal[1], 10) : names.indexOf(ordinal[1]) + 1;
    return { type: "click-link", index, ...(disposition ? { disposition } : {}) };
  }
  const namedTarget = /^(?:click(?: on)?|open) (.+)$/.exec(command);
  if (namedTarget && !/^(?:this|that|it)(?: |$)/.test(namedTarget[1]))
    return { type: "click-target", query: namedTarget[1], ...(disposition ? { disposition } : {}) };

  return { type: "unknown", heard: text.trim() };
}
