import type { Intent } from "../shared";
export function parseModeCommand(text: string): Intent | null {
  const raw = text.trim().replace(/[.!?]+$/, "");
  const t = raw.toLowerCase().replace(/^(?:please )/, "");
  const mode =
    /^(?:switch to |use |enter )?(reading|writing|browsing) mode$/.exec(t);
  if (mode)
    return {
      type: "activity-mode",
      mode: mode[1] as "reading" | "writing" | "browsing",
    };
  if (/^(?:use |enable |resume )?automatic (?:modes|mode detection)$/.test(t))
    return { type: "activity-mode", mode: "auto" };
  if (/^(?:start|stop) dictation$/.test(t))
    return { type: t.startsWith("start") ? "start-typing" : "stop-typing" };
  const edits: Record<
    string,
    Extract<Intent, { type: "writing-command" }>["command"]
  > = {
    "scratch that": "scratch",
    "put that back": "restore",
    "cut the last sentence": "sentence",
    "delete the last sentence": "sentence",
    "new paragraph": "paragraph",
    "use verbatim dictation": "verbatim",
    "use cleaned dictation": "cleaned",
    "read back what i just wrote": "readback",
  };
  if (edits[t]) return { type: "writing-command", command: edits[t] };
  const replace =
    /^replace (?:the last )?["']?(.+?)["']? with ["']?(.+?)["']?$/i.exec(raw);
  if (replace)
    return {
      type: "writing-command",
      command: "replace",
      from: replace[1],
      to: replace[2],
    };
  if (
    /^(?:make (?:this|the last paragraph) (?:clearer|shorter|more professional|more formal)|shorten (?:this|the last paragraph)|turn (?:this|these thoughts) into .+)$/.test(
      t,
    )
  )
    return { type: "writing-command", command: "rewrite", instruction: raw };
  const zoom = /^zoom (?:this |the )?page to (\d{2,3}) (?:percent|%)$/.exec(t);
  if (zoom)
    return {
      type: "reading-command",
      command: "zoom",
      value: Number(zoom[1]) / 100,
    };
  const voice = /^use reading voice (.+)$/.exec(t);
  if (voice)
    return { type: "reading-command", command: "voice", text: voice[1] };
  const reading: Record<string, string> = {
    "list reading voices": "voices",
    "zoom in": "zoom-in",
    "zoom out": "zoom-out",
    "restore previous page zoom": "zoom-restore",
    "magnify more": "magnify-more",
    "magnify less": "magnify-less",
    "close the magnifier": "magnify-close",
    "freeze the magnifier": "magnify-freeze",
    "turn off hover magnification": "hover-off",
    "turn on hover magnification": "hover-on",
    "read this article": "target",
    "read this article aloud": "play",
    "read this section aloud": "play",
    "read the selected passage": "selection-play",
    "pause reading": "pause",
    "resume reading": "resume",
    "stop reading aloud": "stop",
    "read slower": "slower",
    "read faster": "faster",
    "next paragraph": "next",
    "previous paragraph": "previous",
    "next heading": "next-heading",
    "previous heading": "previous-heading",
    "list sections": "headings",
    "highlight what you are reading": "follow",
    "start highlight": "selection-start",
    "start highlighting": "selection-start",
    "finish highlight": "selection-end",
    "stop highlighting": "selection-end",
    "clear highlight": "selection-clear",
    "number the words": "number-words",
    "number the sentences": "number-sentences",
    "make the reading text larger": "text-larger",
    "make the reading text smaller": "text-smaller",
    "use relaxed spacing": "spacing",
    "use warm paper": "paper",
    "use dark reading colors": "dark",
    "use light reading colors": "light",
    "open a simplified reading view": "reader",
    "close the reading view": "reader-close",
    "continue where i stopped": "resume",
  };
  if (reading[t]) return { type: "reading-command", command: reading[t] };
  if (
    /^(?:magnify|read from|highlight|select (?:from|words?|sentences?|the last))\b/.test(
      t,
    )
  )
    return {
      type: "reading-command",
      command: /^magnify/.test(t)
        ? "magnify"
        : /^read from/.test(t)
          ? "heading"
          : /^find/.test(t)
            ? "find"
            : "select",
      text: raw.replace(/^(?:magnify|read from|find)\s*/i, ""),
    };
  return null;
}
