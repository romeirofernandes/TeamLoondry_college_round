import { readingSentences } from "../reading/model";
/** Read only the editor's rendered accessibility text, never toolbar/account labels. */
export function docsSnapshot(): {
  text: string;
  focused: boolean;
  editable: boolean;
  url: string;
  caret: string;
} {
  const frame = document.querySelector<HTMLIFrameElement>(
    ".docs-texteventtarget-iframe",
  );
  const body = frame?.contentDocument?.querySelector<HTMLElement>(
    '[contenteditable="true"]',
  );
  const editor = document.querySelector(".kix-appview-editor");
  const annotations =
    editor?.querySelectorAll(
      '[role="paragraph"][aria-label],.kix-canvas-tile-content rect[aria-label],.kix-canvas-tile-content text',
    ) ?? [];
  const parts = Array.from(annotations).map(
    (n) => n.getAttribute("aria-label") ?? n.textContent ?? "",
  );
  if (!parts.length)
    for (const n of Array.from(
      editor?.querySelectorAll(".kix-lineview-text-block") ?? [],
    ))
      parts.push(n.textContent || "");
  const caret = document.getElementById("kix-current-user-cursor-caret");
  const transform = caret?.parentElement?.style.transform;
  return {
    caret: transform || "",
    text: parts.join("\n").slice(0, 100000),
    focused: !!body && document.activeElement === frame,
    editable:
      !!body &&
      (body.isContentEditable ||
        body.getAttribute("contenteditable") === "true"),
    url: location.href,
  };
}
export class GoogleDocsEditor {
  generation = 0;
  private caret = "";
  private sync(status: ReturnType<typeof docsSnapshot>) {
    if (this.caret && status.caret && this.caret !== status.caret) {
      this.generation++;
    }
    this.caret = status.caret;
  }
  private history: {
    before: string;
    after: string;
    text: string;
    beforeCaret: string;
    afterCaret: string;
    redo?: boolean;
  }[] = [];
  private removed: {
    before: string;
    after: string;
    text: string;
    beforeCaret: string;
    afterCaret: string;
    redo?: boolean;
  } | null = null;
  constructor(
    private input: (
      text: string,
      command: "insert" | "scratch" | "restore",
      expected: string,
      generation: number,
    ) => Promise<any>,
  ) {}
  clear() {
    this.caret = "";
    this.generation++;
    this.history = [];
    this.removed = null;
  }
  focus() {
    const frame = document.querySelector<HTMLIFrameElement>(
      ".docs-texteventtarget-iframe",
    );
    const body = frame?.contentDocument?.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    );
    if (!body || !docsSnapshot().editable)
      throw new Error(
        "Google Docs is not editable. Open an editable document and place the caret in its body.",
      );
    body.focus();
    return true;
  }
  context() {
    const status = docsSnapshot();
    this.sync(status);
    const entry = this.history.at(-1);
    return {
      docs: true,
      binding: this.generation,
      expected: status.text,
      text: entry && entry.after === status.text ? entry.text : "",
      editable: status.editable,
      focused: status.focused,
    };
  }
  async insert(text: string, expected?: string, generation?: number) {
    if (text.includes("\n")) {
      if (text.trim())
        throw new Error(
          "For Docs, dictate one paragraph at a time and use new paragraph between them. Nothing inserted.",
        );
      text = "\n";
    }
    const status = docsSnapshot();
    this.sync(status);
    if (
      !status.focused ||
      !status.editable ||
      (generation !== undefined && generation !== this.generation) ||
      (expected !== undefined && expected !== status.text)
    )
      throw new Error("Google Docs focus or text changed. Nothing inserted.");
    const previous = this.history.at(-1);
    if (
      previous?.after === status.text &&
      previous.afterCaret === status.caret &&
      previous.text &&
      !/\s$/.test(previous.text) &&
      text &&
      !/^[\s.,!?;:]/.test(text)
    )
      text = " " + text;
    const before = status.text;
    const result = await this.input(text, "insert", before, this.generation);
    if (!result?.ok)
      throw new Error(
        result?.error ||
          "Google Docs could not verify insertion. Check the draft before retrying.",
      );
    const resultSnapshot = docsSnapshot();
    this.caret = resultSnapshot.caret;
    const after = resultSnapshot.text;
    if (
      text.trim()
        ? after === before ||
          !after.replace(/\s/g, "").includes(text.replace(/\s/g, ""))
        : resultSnapshot.caret === status.caret
    ) {
      this.clear();
      throw new Error(
        "Google Docs insertion could not be verified. Check the document before retrying.",
      );
    }
    this.history.push({
      before,
      after,
      text,
      beforeCaret: status.caret,
      afterCaret: resultSnapshot.caret,
    });
    while (
      this.history.length > 20 ||
      this.history.reduce((n, e) => n + e.before.length + e.after.length, 0) >
        32768
    )
      this.history.shift();
    this.removed = null;
    return true;
  }
  async scratch() {
    this.sync(docsSnapshot());
    const e = this.history.at(-1);
    if (
      !e ||
      docsSnapshot().text !== e.after ||
      (!e.text.trim() && docsSnapshot().caret !== e.afterCaret)
    )
      throw new Error(
        "The document changed or no recent segment is available. No deletion performed.",
      );
    const result = await this.input("", "scratch", e.after, this.generation);
    // Docs may group consecutive dictation events into one native Undo.
    // Recover only earlier, contiguous Handsfree segments whose saved baseline matches.
    if (result?.ok && docsSnapshot().text !== e.before) {
      const snapshot = docsSnapshot();
      const first = this.history.findIndex(
        (entry) =>
          entry.before === snapshot.text &&
          (entry.text.trim() || entry.beforeCaret === snapshot.caret),
      );
      const prefix = first >= 0 ? this.history.slice(first, -1) : [];
      if (
        prefix.length &&
        prefix.every(
          (entry, i) => entry.after === (prefix[i + 1]?.before ?? e.before),
        )
      ) {
        this.caret = snapshot.caret;
        for (const entry of prefix) {
          const expected = docsSnapshot().text;
          if (expected !== entry.before) break;
          const recovered = await this.input(
            entry.text,
            "insert",
            expected,
            this.generation,
          );
          this.caret = docsSnapshot().caret;
          if (!recovered?.ok || docsSnapshot().text !== entry.after) break;
        }
        if (docsSnapshot().text === e.before) {
          e.redo = false;
          e.beforeCaret = docsSnapshot().caret;
        }
      }
    }

    if (
      !result?.ok ||
      docsSnapshot().text !== e.before ||
      (!e.text.trim() && docsSnapshot().caret !== e.beforeCaret)
    ) {
      this.clear();
      throw new Error(
        result?.error ||
          "Google Docs undo could not be verified. Check the document.",
      );
    }
    this.caret = docsSnapshot().caret;
    this.history.pop();
    this.removed = e;
    return true;
  }
  async restore() {
    this.sync(docsSnapshot());
    const e = this.removed;
    if (
      !e ||
      docsSnapshot().text !== e.before ||
      (!e.text.trim() && docsSnapshot().caret !== e.beforeCaret)
    )
      throw new Error(
        "The document changed or no removed segment is available.",
      );
    if (e.redo === false && docsSnapshot().caret !== e.beforeCaret)
      throw new Error("The restore position changed. Nothing inserted.");
    const result = await this.input(
      e.redo === false ? e.text : "",
      e.redo === false ? "insert" : "restore",
      e.before,
      this.generation,
    );
    if (
      !result?.ok ||
      docsSnapshot().text !== e.after ||
      (!e.text.trim() && docsSnapshot().caret !== e.afterCaret)
    ) {
      this.clear();
      throw new Error(
        result?.error || "Google Docs restore could not be verified.",
      );
    }
    this.caret = docsSnapshot().caret;
    e.afterCaret = this.caret;
    this.history.push(e);
    this.removed = null;
    return true;
  }
  async revise(text: string, expected?: string) {
    const entry = this.history.at(-1);
    if (!entry || (expected !== undefined && expected !== entry.after))
      throw new Error(
        "The revision target changed. Ask for the revision again.",
      );
    await this.scratch();
    if (!text) return true;
    try {
      return await this.insert(text, entry.before, this.generation);
    } catch (error) {
      throw new Error(
        `The previous segment was removed but its replacement could not be verified. Check your draft. ${error instanceof Error ? error.message : ""}`,
      );
    }
  }
  async replace(from: string, to: string) {
    const entry = this.history.at(-1);
    if (!entry) throw new Error("No recent segment to correct.");
    const source = entry.text.toLowerCase(),
      needle = from.toLowerCase();
    const index = source.indexOf(needle);
    if (!from || index < 0)
      throw new Error("That phrase is not in the last segment.");
    if (source.indexOf(needle, index + 1) >= 0)
      throw new Error(
        "That phrase occurs more than once. Use a unique phrase.",
      );
    return this.revise(
      entry.text.slice(0, index) + to + entry.text.slice(index + from.length),
      entry.after,
    );
  }
  async sentence() {
    const entry = this.history.at(-1);
    if (!entry) throw new Error("No recent sentence to remove.");
    const sentence = readingSentences(entry.text).at(-1);
    if (!sentence) throw new Error("No sentence found.");
    return this.revise(
      entry.text.slice(0, sentence.start).trimEnd(),
      entry.after,
    );
  }
}
