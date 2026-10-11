import { readingSentences } from "../reading/model";
import { editable, insertText } from "../content/dom";
export function editorText(element: HTMLElement) {
  return element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
    ? element.value
    : element.textContent || "";
}
type Entry = {
  target: HTMLElement;
  before: string;
  after: string;
  start: number;
  end: number;
  beforeEnd: number;
  text: string;
};
/** Only inverse edits whose full target text still matches. Never use a blind native Undo. */
export class EditLedger {
  private entries: Entry[] = [];
  private removed: Entry | null = null;
  clear() {
    this.entries = [];
    this.removed = null;
  }
  last() {
    return this.entries.at(-1);
  }
  context() {
    const entry = this.last();
    if (
      !entry ||
      !entry.target.isConnected ||
      editorText(entry.target) !== entry.after
    )
      return null;
    return { text: entry.text, expected: entry.after };
  }
  insert(target: HTMLElement, text: string) {
    const before = editorText(target);
    if (!insertText(target, text)) return false;
    const after = editorText(target);
    if (after === before) return true;
    let start = 0;
    while (
      start < Math.min(before.length, after.length) &&
      before[start] === after[start]
    )
      start++;
    let suffix = 0;
    while (
      suffix < before.length - start &&
      suffix < after.length - start &&
      before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
    )
      suffix++;
    const end = after.length - suffix,
      beforeEnd = before.length - suffix;
    this.entries.push({
      target,
      before,
      after,
      start,
      end,
      beforeEnd,
      text: after.slice(start, end),
    });
    while (
      this.entries.length > 20 ||
      this.entries.reduce((n, e) => n + e.before.length + e.after.length, 0) >
        32768
    )
      this.entries.shift();
    this.removed = null;
    return true;
  }
  private change(
    entry: Entry,
    expected: string,
    start: number,
    end: number,
    text: string,
  ) {
    const e = entry.target;
    if (!e.isConnected || !editable(e) || editorText(e) !== expected)
      throw new Error(
        "The draft changed. Select the text again before correcting it.",
      );
    e.focus({ preventScroll: true });
    if (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement) {
      e.setSelectionRange(start, end);
      const setter = Object.getOwnPropertyDescriptor(
        e instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(e, expected.slice(0, start) + text + expected.slice(end));
      e.setSelectionRange(start + text.length, start + text.length);
      e.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertReplacementText",
          data: text,
        }),
      );
    } else {
      const walker = e.ownerDocument.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      let offset = 0;
      let first: Node | null = null;
      let last: Node | null = null;
      let a = 0,
        b = 0;
      while ((n = walker.nextNode())) {
        const len = n.textContent?.length ?? 0;
        if (first === null && start <= offset + len) {
          first = n;
          a = start - offset;
        }
        if (end <= offset + len) {
          last = n;
          b = end - offset;
          break;
        }
        offset += len;
      }
      const range = e.ownerDocument.createRange();
      if (!first && !last && start === 0 && end === 0 && !e.textContent) {
        range.selectNodeContents(e);
      } else {
        if (!first || !last)
          throw new Error("The editor range is unavailable.");
        range.setStart(first, a);
        range.setEnd(last, b);
      }
      const selection = e.ownerDocument.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      if (!e.ownerDocument.execCommand?.("insertText", false, text))
        throw new Error("This editor cannot apply a verified correction.");
    }
    if (
      editorText(e) !==
      expected.slice(0, start) + text + expected.slice(end)
    ) {
      this.clear();
      throw new Error(
        "Correction could not be verified. Check the draft before retrying.",
      );
    }
  }
  scratch() {
    const entry = this.last();
    if (!entry) throw new Error("No recent Handsfree segment to remove.");
    this.change(
      entry,
      entry.after,
      entry.start,
      entry.end,
      entry.before.slice(entry.start, entry.beforeEnd),
    );
    this.entries.pop();
    this.removed = entry;
  }
  restore() {
    const entry = this.removed;
    if (!entry) throw new Error("No removed segment to restore.");
    this.change(entry, entry.before, entry.start, entry.beforeEnd, entry.text);
    this.entries.push(entry);
    this.removed = null;
  }
  revise(text: string, expected?: string) {
    const e = this.last();
    if (!e || (expected && expected !== e.after))
      throw new Error(
        "The revision target changed. Ask for the revision again.",
      );
    this.change(e, e.after, e.start, e.end, text);
    e.after = editorText(e.target);
    e.end = e.start + text.length;
    e.text = text;
    this.removed = null;
  }
  replace(from: string, to: string) {
    const e = this.last();
    if (!e) throw new Error("No recent segment to correct.");
    const source = e.text.toLowerCase(),
      needle = from.toLowerCase();
    const index = source.lastIndexOf(needle);
    if (!needle || index < 0)
      throw new Error("That phrase is not in the last segment.");
    if (source.indexOf(needle) !== index)
      throw new Error(
        "That phrase occurs more than once. Use a unique phrase.",
      );
    this.revise(
      e.text.slice(0, index) + to + e.text.slice(index + from.length),
    );
  }
  sentence() {
    const e = this.last();
    if (!e) throw new Error("No recent sentence to remove.");
    const m = readingSentences(e.text).at(-1);
    if (!m) throw new Error("No sentence found.");
    const next = e.text.slice(0, m.start).trimEnd();
    if (!next) this.scratch();
    else this.revise(next);
  }
}
