import {
  readingSentences,
  readingPreferences,
  readingDefaults,
  type ReadingPreferences,
} from "./model";
import type { Message } from "../shared";
export interface ReadingBlock {
  element: HTMLElement;
  text: string;
  nodes: Text[];
  start: number;
  end: number;
}
const excluded =
  'nav,aside,footer,script,style,[hidden],[inert],[aria-hidden="true"],input,textarea,[contenteditable="true"],[data-handsfree-ignore],#handsfree-assist-overlay';
const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  twenty: 20,
};
export const readNumber = (s: string) =>
  numberWords[s.toLowerCase()] ?? Number(s);
export function collectReading(): {
  blocks: ReadingBlock[];
  text: string;
  revision: string;
} {
  const root =
    document.querySelector(
      '#mw-content-text .mw-parser-output,article,[role="main"],main',
    ) || document.body;
  const blocks: ReadingBlock[] = [];
  let text = "";
  for (const e of Array.from(
    root.querySelectorAll<HTMLElement>("p,h1,h2,h3,h4,li,pre,blockquote"),
  ).slice(0, 3000)) {
    if (e.closest(excluded) || e.querySelector("p,li,pre,blockquote")) continue;
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      if (n.parentElement?.closest(excluded)) continue;
      const style = getComputedStyle(n.parentElement!);
      if (style.display === "none" || style.visibility === "hidden") continue;
      nodes.push(n as Text);
    }
    const value = nodes.map((n) => n.data).join("");
    if (!value.trim()) continue;
    if (text.length + value.length > 250000) break;
    const start = text.length;
    text += value + "\n";
    blocks.push({
      element: e,
      text: value,
      nodes,
      start,
      end: start + value.length,
    });
  }
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return { blocks, text, revision: location.href + ":" + (hash >>> 0) };
}
export function localReadingRange(
  request: string,
  text: string,
): { start: number; end: number } | null {
  const normalized = request
    .toLowerCase()
    .replace(/[.!?]+$/, "")
    .trim();
  const words = [...text.matchAll(/\S+/g)];
  let m =
    /^(?:highlight|select) (?:from )?words? (\w+) (?:to|through) (\w+)$/.exec(
      normalized,
    );
  if (m) {
    const a = readNumber(m[1]),
      b = readNumber(m[2]);
    if (
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      a < 1 ||
      b < a ||
      b > words.length
    )
      throw new Error(`Choose word numbers from 1 to ${words.length}.`);
    return {
      start: words[a - 1].index!,
      end: words[b - 1].index! + words[b - 1][0].length,
    };
  }
  m = /^(?:highlight|select) word (\w+)$/.exec(normalized);
  if (m) return localReadingRange(`highlight words ${m[1]} to ${m[1]}`, text);
  const sentences = readingSentences(text).map((s) => ({
    0: s.text,
    index: s.start,
  }));
  m =
    /^(?:highlight|select) (?:from )?sentences? (\w+)(?: (?:to|through) (\w+))?$/.exec(
      normalized,
    );
  if (m) {
    const a = readNumber(m[1]),
      b = m[2] ? readNumber(m[2]) : a;
    if (
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      a < 1 ||
      b < a ||
      b > sentences.length
    )
      throw new Error(`Choose sentence numbers from 1 to ${sentences.length}.`);
    return {
      start: sentences[a - 1].index!,
      end: sentences[b - 1].index! + sentences[b - 1][0].trimEnd().length,
    };
  }
  m =
    /^(?:highlight|select) (?:the )?last (\w+) words (?:of|in) sentence (\w+)$/.exec(
      normalized,
    );
  if (m) {
    const count = readNumber(m[1]),
      index = readNumber(m[2]);
    const sentence = sentences[index - 1];
    if (!sentence || !Number.isInteger(count) || count < 1)
      throw new Error("Choose a valid sentence and word count.");
    const w = [...sentence[0].matchAll(/\S+/g)];
    if (count > w.length) throw new Error("That sentence has fewer words.");
    return {
      start: sentence.index! + w[w.length - count].index!,
      end: sentence.index! + w.at(-1)!.index! + w.at(-1)![0].length,
    };
  }
  const phrase =
    /^(?:highlight|select) from ["'](.+?)["'] to ["'](.+?)["']$/i.exec(request);
  if (phrase) {
    const source = text.toLowerCase(),
      a = phrase[1].toLowerCase(),
      b = phrase[2].toLowerCase();
    const start = source.indexOf(a),
      end = source.indexOf(b, start + a.length);
    if (start < 0 || end < 0)
      throw new Error("Those phrases are not in the current paragraph.");
    if (source.indexOf(a, start + 1) >= 0 || source.indexOf(b, end + 1) >= 0)
      throw new Error("That phrase repeats. Use numbered words or sentences.");
    return { start, end: end + b.length };
  }
  return null;
}
export class ReadingRuntime {
  private enabled = false;
  private index = 0;
  private scale = 2;
  private rate = 0.95;
  private hover = true;
  private frozen = false;
  private candidate: HTMLElement | null = null;
  private since = 0;
  private pointer: { x: number; y: number } | null = null;
  private textPointer: { x: number; y: number } | null = null;
  private lastPoint = 0;
  private lens = document.createElement("div");
  private tools = document.createElement("div");
  private reader = document.createElement("section");
  private playing = false;
  private selectedSpeech: string | null = null;
  private playback = 0;
  private selectedStart: number | null = null;
  private follow = false;
  private lastRevision = "";
  private selectedBlock: ReadingBlock | null = null;
  private choices: { start: number; end: number; revision: string }[] = [];
  private fontSize = 24;
  private preferences: ReadingPreferences = { ...readingDefaults };
  private preferencesChanged = false;
  private destroyed = false;
  constructor(private send: (message: Message) => Promise<unknown>) {
    for (const [element, id] of [
      [this.lens, "handsfree-reading-lens"],
      [this.tools, "handsfree-reading-tools"],
      [this.reader, "handsfree-reading-view"],
    ] as const) {
      element.id = id;
      element.dataset.handsfreeIgnore = "true";
      element.hidden = true;
    }
    this.lens.style.cssText =
      "position:fixed;z-index:2147483646;pointer-events:none;padding:18px;border:2px solid #416719;border-radius:12px;background:#fffef5;color:#20231b;max-height:50vh;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;box-sizing:border-box";
    this.lens.setAttribute("role", "region");
    this.lens.setAttribute("aria-label", "Magnified reading text");
    this.tools.style.cssText =
      "position:fixed;right:12px;top:12px;z-index:2147483646;background:#20231b;color:#fff;padding:8px;display:flex;gap:6px;flex-wrap:wrap;max-width:calc(100vw - 24px);border-radius:10px;font:14px system-ui;box-sizing:border-box";
    this.tools.setAttribute("role", "toolbar");
    this.tools.setAttribute("aria-label", "Reading controls");
    for (const [label, command] of [
      ["Read aloud", "play"],
      ["Pause reading", "pause"],
      ["Resume reading", "resume"],
      ["Stop reading", "stop"],
      ["Start highlight", "selection-start"],
      ["Finish highlight", "selection-end"],
      ["Number words", "number-words"],
      ["Number sentences", "number-sentences"],
      ["Clear highlight", "selection-clear"],
    ] as const) {
      const b = document.createElement("button");
      b.textContent = label;
      b.type = "button";
      b.style.cssText =
        "min-height:40px;padding:6px 10px;background:#f6f7f2;color:#20231b;border:1px solid #c1ef53;border-radius:5px;font:inherit";
      b.addEventListener("click", () => {
        try {
          void this.command(command);
        } catch (e) {
          this.notice(
            e instanceof Error ? e.message : "Reading action failed.",
          );
        }
      });
      this.tools.append(b);
    }
    this.reader.style.cssText =
      "position:fixed;inset:60px 12px 12px;z-index:2147483645;overflow:auto;padding:24px;background:#fffef5;color:#20231b;font:24px/1.7 system-ui;white-space:pre-wrap;border:2px solid #416719;border-radius:12px;box-sizing:border-box";
    this.reader.setAttribute("role", "region");
    this.reader.setAttribute("aria-label", "Simplified reading view");
    this.reader.tabIndex = 0;
    void this.send({ type: "READING_PREFERENCES" })
      .then((value) => {
        if (!this.destroyed && !this.preferencesChanged) {
          this.preferences = readingPreferences(value);
          this.applyPreferences();
        }
      })
      .catch(() => {});
  }
  private notice(text: string) {
    void this.send({ type: "SET_STATE", patch: { feedback: text } }).catch(
      () => {},
    );
  }
  enable(enabled: boolean) {
    if (enabled)
      for (const e of [this.lens, this.tools, this.reader])
        if (!e.isConnected) document.body.append(e);
    if (enabled && !this.enabled) {
      const source = collectReading();
      const first = source.blocks.findIndex(
        (b) => !/^H[1-4]$/.test(b.element.tagName),
      );
      if (first >= 0) this.index = first;
    }
    const wasEnabled = this.enabled;
    this.enabled = enabled;
    this.tools.hidden = !enabled;
    this.tools.style.display = enabled ? "flex" : "none";
    if (!enabled) {
      this.closeLens();
      this.reader.hidden = true;
      if (wasEnabled) this.stop();
      this.selectedStart = null;
      this.choices = [];
    }
  }
  context() {
    const source = collectReading();
    this.index = Math.min(this.index, Math.max(0, source.blocks.length - 1));
    const b = source.blocks[this.index];
    return {
      text: b?.text ?? "",
      revision: source.revision,
      start: b?.start ?? 0,
      paragraph: this.index + 1,
      blocks: source.blocks.length,
    };
  }
  private show(block: ReadingBlock, x: number, y: number) {
    this.selectedBlock = block;
    this.lens.textContent = block.text;
    this.lens.style.fontSize = `${Math.round(16 * this.scale)}px`;
    this.lens.style.lineHeight = this.preferences.relaxed ? "1.8" : "1.6";
    const width = Math.min(560, innerWidth - 24);
    this.lens.style.width = `${width}px`;
    this.lens.style.left = `${Math.max(12, Math.min(innerWidth - width - 12, x - width / 2))}px`;
    this.lens.style.top = `${Math.max(60, Math.min(innerHeight - 160, y - 90))}px`;
    this.lens.hidden = false;
  }
  closeLens() {
    this.lens.hidden = true;
    this.candidate = null;
    this.since = performance.now();
    this.frozen = false;
  }
  private wordAt(x: number, y: number) {
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const range = doc.caretRangeFromPoint?.(x, y);
    if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return null;
    const node = range.startContainer as Text;
    const source = collectReading();
    for (const block of source.blocks) {
      let offset = block.start;
      for (const n of block.nodes) {
        if (n === node) {
          const words = [...n.data.matchAll(/\S+/g)];
          const w = words.find(
            (w) =>
              w.index! <= range.startOffset &&
              w.index! + w[0].length >= range.startOffset,
          );
          return w
            ? {
                start: offset + w.index!,
                end: offset + w.index! + w[0].length,
                revision: source.revision,
              }
            : null;
        }
        offset += n.length;
      }
    }
    return null;
  }
  point(x: number, y: number, confident: boolean, now = performance.now()) {
    if (!confident) {
      this.closeLens();
      return;
    }
    this.pointer = { x, y };
    if (now - this.lastPoint < 80) return;
    this.lastPoint = now;
    const hitText = document.elementFromPoint(x, y);
    if (
      hitText &&
      !hitText.closest(
        "[data-handsfree-ignore],a,button,input,textarea,[contenteditable]",
      )
    )
      this.textPointer = { x, y };
    if (this.selectedStart !== null) {
      const word = this.wordAt(x, y);
      if (word && word.revision === this.lastRevision)
        this.select(
          Math.min(this.selectedStart, word.start),
          Math.max(this.selectedStart, word.end),
          word.revision,
        );
      return;
    }
    if (!this.hover || this.frozen) return;
    const hit = document.elementFromPoint(x, y);
    if (
      !hit ||
      hit.closest(
        "a,button,input,textarea,[contenteditable],[data-handsfree-ignore]",
      )
    ) {
      this.closeLens();
      return;
    }
    const source = collectReading();
    const block = source.blocks.find((b) => b.element.contains(hit));
    if (!block) {
      this.closeLens();
      return;
    }
    this.index = source.blocks.indexOf(block);
    if (this.candidate !== block.element) {
      this.lens.hidden = true;
      this.candidate = block.element;
      this.since = now;
    } else if (now - this.since >= 1200) this.show(block, x, y);
  }
  select(start: number, end: number, revision: string) {
    const source = collectReading();
    if (
      revision !== source.revision ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end <= start ||
      end > source.text.length
    )
      throw new Error("The reading text changed. Choose the range again.");
    const range = document.createRange();
    let a = false,
      b = false;
    for (const block of source.blocks) {
      let offset = block.start;
      for (const node of block.nodes) {
        if (!a && start >= offset && start < offset + node.length) {
          range.setStart(node, start - offset);
          a = true;
        }
        if (a && end > offset && end <= offset + node.length) {
          range.setEnd(node, end - offset);
          b = true;
          break;
        }
        offset += node.length;
      }
      if (b) break;
    }
    if (!a || !b) throw new Error("That range is no longer available.");
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    this.lastRevision = revision;
    return { ok: true };
  }
  private stop() {
    this.playback++;
    this.playing = false;
    this.selectedSpeech = null;
    window.speechSynthesis?.cancel();
    void this.send({ type: "READING_AUDIO", active: false, text: "" }).catch(
      () => {},
    );
  }
  private speak(text: string, token: number, done?: () => void) {
    const voice = window.speechSynthesis;
    if (!voice) throw new Error("Read aloud is unavailable in this browser.");
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = this.rate;
    const voices = voice.getVoices().filter((v) => v.lang.startsWith("en"));
    u.voice =
      voices.find((v) => v.voiceURI === this.preferences.voice) ||
      voices.find((v) => v.localService) ||
      voices[0] ||
      null;
    u.onend = () => {
      if (token !== this.playback) return;
      void this.send({ type: "READING_AUDIO", active: false, text: "" }).catch(
        () => {},
      );
      done?.();
    };
    u.onerror = () => {
      if (token === this.playback) {
        this.stop();
        this.notice(
          "Reading voice could not finish. Choose another available voice.",
        );
      }
    };
    void this.send({
      type: "READING_AUDIO",
      active: true,
      text: text.slice(0, 8000),
    })
      .then(() => {
        if (token === this.playback) voice.speak(u);
      })
      .catch(() => this.stop());
  }
  private play() {
    this.stop();
    this.playing = true;
    const token = this.playback;
    const source = collectReading();
    this.lastRevision = source.revision;
    const next = () => {
      if (token !== this.playback || !this.playing) return;
      const current = collectReading();
      if (current.revision !== this.lastRevision) {
        this.stop();
        this.notice("The article changed. Start reading again.");
        return;
      }
      const b = current.blocks[this.index];
      if (!b) {
        this.stop();
        return;
      }
      if (this.follow) {
        this.select(b.start, b.end, current.revision);
        b.element.scrollIntoView({ block: "center", behavior: "auto" });
      }
      this.speak(b.text, token, () => {
        this.index++;
        next();
      });
    };
    next();
  }
  private applyPreferences() {
    this.scale = this.preferences.scale;
    this.rate = this.preferences.rate;
    this.fontSize = this.preferences.fontSize;
    this.hover = this.preferences.hover;
    this.follow = this.preferences.follow;
    for (const e of [this.reader, this.lens]) {
      e.style.fontSize = `${this.fontSize}px`;
      e.style.lineHeight = this.preferences.relaxed ? "1.8" : "1.6";
      e.style.background =
        this.preferences.theme === "dark"
          ? "#20231b"
          : this.preferences.theme === "paper"
            ? "#fff4dd"
            : "#ffffff";
      e.style.color = this.preferences.theme === "dark" ? "#f6f7f2" : "#20231b";
    }
  }
  command(command: string, text?: string): any {
    const result = this.run(command, text);
    if (
      [
        "magnify-more",
        "magnify-less",
        "hover-on",
        "hover-off",
        "slower",
        "faster",
        "follow",
        "text-larger",
        "text-smaller",
        "spacing",
        "paper",
        "dark",
        "light",
        "voice",
      ].includes(command)
    ) {
      this.preferencesChanged = true;
      this.preferences = {
        ...this.preferences,
        scale: this.scale,
        rate: this.rate,
        fontSize: this.fontSize,
        hover: this.hover,
        follow: this.follow,
        relaxed: command === "spacing" || this.preferences.relaxed,
        theme: ["paper", "dark", "light"].includes(command)
          ? (command as ReadingPreferences["theme"])
          : this.preferences.theme,
      };
      void this.send({
        type: "READING_PREFERENCES",
        value: this.preferences,
      }).catch(() => {});
    }
    return result;
  }
  private run(command: string, text?: string): any {
    const source = collectReading();
    if (!source.blocks.length)
      throw new Error("No readable article text is available here.");
    this.index = Math.min(this.index, source.blocks.length - 1);
    let b = source.blocks[this.index];
    if (command === "voices") {
      const voices =
        window.speechSynthesis
          ?.getVoices()
          .filter((v) => v.lang.startsWith("en")) ?? [];
      this.notice(
        voices.length
          ? voices.map((v, i) => `${i + 1}. ${v.name}`).join("\n") +
              "\nSay use reading voice followed by its number."
          : "Reading voices are still loading. Try again shortly.",
      );
      return { ok: true };
    }
    if (command === "voice") {
      const voices =
        window.speechSynthesis
          ?.getVoices()
          .filter((v) => v.lang.startsWith("en")) ?? [];
      const voice = voices[readNumber(text || "") - 1];
      if (!voice)
        throw new Error(
          "List reading voices first and choose an available number.",
        );
      this.preferences.voice = voice.voiceURI;
      if (this.playing) this.play();
      return { ok: true };
    }
    if (command === "target") {
      this.notice(
        `Reading ${source.blocks.length} paragraphs and headings. Say read this article aloud or magnify this paragraph.`,
      );
      return { ok: true };
    }
    if (command === "play") {
      this.play();
      return { ok: true };
    }
    if (command === "pause") {
      window.speechSynthesis?.pause();
      void this.send({ type: "READING_AUDIO", active: false, text: "" });
      return { ok: true };
    }
    if (command === "resume") {
      if (this.playing) {
        void this.send({
          type: "READING_AUDIO",
          active: true,
          text: this.selectedSpeech ?? b.text,
        });
        window.speechSynthesis?.resume();
      } else this.play();
      return { ok: true };
    }
    if (command === "stop") {
      this.stop();
      return { ok: true };
    }
    if (command === "selection-play") {
      const selected = document.getSelection()?.toString();
      if (
        !selected ||
        !source.blocks.some((b) =>
          b.element.contains(document.getSelection()?.anchorNode ?? null),
        )
      )
        throw new Error("Highlight an article passage first.");
      this.stop();
      this.playing = true;
      this.selectedSpeech = selected;
      this.speak(selected, this.playback, () => {
        this.playing = false;
        this.selectedSpeech = null;
      });
      return { ok: true };
    }
    if (command === "slower" || command === "faster") {
      this.rate = Math.max(
        0.5,
        Math.min(2, this.rate + (command === "slower" ? -0.15 : 0.15)),
      );
      if (this.playing) this.play();
      return { ok: true };
    }
    if (command === "follow") {
      this.follow = !this.follow;
      return { ok: true };
    }
    if (command === "headings") {
      const headings = source.blocks.filter((b) =>
        /^H[1-4]$/.test(b.element.tagName),
      );
      this.notice(
        headings
          .slice(0, 30)
          .map((b, i) => `${i + 1}. ${b.text}`)
          .join("\n") || "No headings in this region.",
      );
      return { ok: true };
    }
    if (
      ["next", "previous", "next-heading", "previous-heading"].includes(command)
    ) {
      const dir = command.startsWith("previous") ? -1 : 1;
      let index = this.index + dir;
      while (index >= 0 && index < source.blocks.length) {
        if (
          !command.includes("heading") ||
          /^H[1-4]$/.test(source.blocks[index].element.tagName)
        )
          break;
        index += dir;
      }
      if (index < 0 || index >= source.blocks.length)
        throw new Error("You reached the end of this reading region.");
      this.index = index;
      b = source.blocks[index];
      b.element.scrollIntoView({ block: "center", behavior: "auto" });
      this.select(b.start, b.end, source.revision);
      if (this.playing) this.play();
      return { ok: true };
    }
    if (command === "heading" || command === "find") {
      const q = (text || "")
        .toLowerCase()
        .replace(/['"]/g, "")
        .replace(/ in (?:this|the) (?:article|paper)$/, "");
      const matches = source.blocks.filter(
        (b) =>
          (command === "find" || /^H[1-4]$/.test(b.element.tagName)) &&
          b.text.toLowerCase().includes(q),
      );
      if (!q || matches.length !== 1)
        throw new Error(
          matches.length
            ? "Several passages match. Choose a more specific phrase."
            : "That passage was not found.",
        );
      this.index = source.blocks.indexOf(matches[0]);
      b = matches[0];
      b.element.scrollIntoView({ block: "center", behavior: "auto" });
      this.select(b.start, b.end, source.revision);
      if (command === "heading") this.play();
      return { ok: true };
    }
    if (command === "magnify-close") {
      this.closeLens();
      this.hover = false;
      return { ok: true };
    }
    if (command === "hover-off" || command === "hover-on") {
      this.hover = command === "hover-on";
      this.closeLens();
      return { ok: true };
    }
    if (command === "magnify-freeze") {
      this.frozen = true;
      return { ok: true };
    }
    if (command === "magnify-more" || command === "magnify-less")
      this.scale = Math.max(
        1.5,
        Math.min(3, this.scale + (command === "magnify-more" ? 0.25 : -0.25)),
      );
    if (command.startsWith("magnify")) {
      this.show(
        b,
        this.pointer?.x ?? innerWidth / 2,
        this.pointer?.y ?? innerHeight / 2,
      );
      return { ok: true };
    }
    if (command === "selection-start") {
      const word = this.textPointer
        ? this.wordAt(this.textPointer.x, this.textPointer.y)
        : null;
      this.selectedStart = word?.start ?? b.start;
      this.lastRevision = source.revision;
      this.notice(
        "Move your head pointer across the words, then choose Finish highlight or say finish highlight.",
      );
      return { ok: true };
    }
    if (command === "selection-end") {
      this.selectedStart = null;
      this.notice("Highlight finished. Say read the selected passage.");
      return { ok: true };
    }
    if (command === "selection-clear") {
      this.selectedStart = null;
      document.getSelection()?.removeAllRanges();
      return { ok: true };
    }
    if (command === "number-words" || command === "number-sentences") {
      const pieces =
        command === "number-words"
          ? [...b.text.matchAll(/\S+/g)]
          : readingSentences(b.text).map((s) => ({ 0: s.text }));
      const label = pieces
        .map((m, i) => `${i + 1}. ${m[0]}`)
        .join(command === "number-words" ? "  " : "\n");
      this.show({ ...b, text: label }, innerWidth / 2, innerHeight / 2);
      this.frozen = true;
      this.notice(
        `Numbers refer to paragraph ${this.index + 1}. Say highlight words 3 to 8 or highlight sentence 2.`,
      );
      return { ok: true };
    }
    if (command === "choose") {
      const choice = this.choices[readNumber(text || "") - 1];
      if (!choice)
        throw new Error(
          "Choose one of the current numbered highlight matches.",
        );
      this.choices = [];
      return this.select(choice.start, choice.end, choice.revision);
    }
    if (command === "select") {
      const phrase =
        /^(?:highlight|select) from ["'](.+?)["'] to ["'](.+?)["']$/i.exec(
          text || "",
        );
      if (phrase) {
        const value = b.text.toLowerCase(),
          a = phrase[1].toLowerCase(),
          z = phrase[2].toLowerCase();
        const choices: { start: number; end: number; revision: string }[] = [];
        for (
          let at = value.indexOf(a);
          at >= 0 && choices.length < 8;
          at = value.indexOf(a, at + 1)
        ) {
          const end = value.indexOf(z, at + a.length);
          if (end >= 0)
            choices.push({
              start: b.start + at,
              end: b.start + end + z.length,
              revision: source.revision,
            });
        }
        if (choices.length > 1) {
          this.choices = choices;
          this.notice(
            choices
              .map(
                (c, i) =>
                  `${i + 1}. ${source.text.slice(c.start, c.end).slice(0, 180)}`,
              )
              .join("\n") +
              "\nSay choose one, choose two, or use numbered words.",
          );
          return { ok: true };
        }
      }
      const range = localReadingRange(text || "", b.text);
      if (range)
        return this.select(
          b.start + range.start,
          b.start + range.end,
          source.revision,
        );
      return { ok: false, complex: true, ...this.context() };
    }
    if (
      [
        "text-larger",
        "text-smaller",
        "spacing",
        "paper",
        "dark",
        "light",
        "reader",
        "reader-close",
      ].includes(command)
    ) {
      if (command === "reader-close") {
        this.reader.hidden = true;
        return { ok: true };
      }
      if (command === "reader") {
        this.reader.style.top = `${Math.max(60, this.tools.getBoundingClientRect().bottom + 12)}px`;
        this.reader.replaceChildren();
        for (const block of source.blocks) {
          const p = document.createElement(
            /^H[1-4]$/.test(block.element.tagName)
              ? block.element.tagName.toLowerCase()
              : "p",
          );
          p.textContent = block.text;
          p.style.maxWidth = "65ch";
          p.style.marginInline = "auto";
          this.reader.append(p);
        }
        this.reader.hidden = false;
      }
      if (command.startsWith("text-"))
        this.fontSize = Math.max(
          18,
          Math.min(40, this.fontSize + (command === "text-larger" ? 4 : -4)),
        );
      for (const e of [this.reader, this.lens]) {
        e.style.fontSize = `${this.fontSize}px`;
        if (command === "spacing") e.style.lineHeight = "1.8";
        if (["paper", "dark", "light"].includes(command)) {
          e.style.background =
            command === "dark"
              ? "#20231b"
              : command === "paper"
                ? "#fff4dd"
                : "#ffffff";
          e.style.color = command === "dark" ? "#f6f7f2" : "#20231b";
        }
      }
      return { ok: true };
    }
    throw new Error("That reading control is unavailable.");
  }
  destroy() {
    this.destroyed = true;
    this.stop();
    this.lens.remove();
    this.tools.remove();
    this.reader.remove();
  }
}
