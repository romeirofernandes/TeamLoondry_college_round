import { docsSnapshot, GoogleDocsEditor } from "../src/editing/google-docs";
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { parseIntent } from "../src/core/parser";
import {
  collectReading,
  localReadingRange,
  ReadingRuntime,
} from "../src/reading/runtime";
import { EditLedger } from "../src/editing/editor";
import {
  cleanRamble,
  ramblerMessages,
  resolveReadingRange,
} from "../src/providers";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
it("keeps ordinary navigation and forms while recognizing task controls", () => {
  expect(parseIntent("writing mode")).toEqual({
    type: "activity-mode",
    mode: "writing",
  });
  expect(
    parseIntent("highlight the last three words of sentence two"),
  ).toMatchObject({ type: "reading-command", command: "select" });
  expect(parseIntent("find reviews")).toEqual({
    type: "find",
    query: "reviews",
  });
  expect(parseIntent("select India for country")).toMatchObject({
    type: "form-command",
  });
  expect(parseIntent("stop dictation")).toEqual({ type: "stop-typing" });
});
it("selects actual word and sentence spans with both endpoints and preserves repeated text", () => {
  const text =
    "The difficult alpha-2 receptor matters. This sentence has five final words.";
  let range = localReadingRange("highlight words three to five", text)!;
  expect(text.slice(range.start, range.end)).toBe("alpha-2 receptor matters.");
  range = localReadingRange("highlight sentence two", text)!;
  expect(text.slice(range.start, range.end).trim()).toBe(
    "This sentence has five final words.",
  );
  range = localReadingRange(
    "highlight the last three words of sentence two",
    text,
  )!;
  expect(text.slice(range.start, range.end)).toBe("five final words.");
  expect(() => localReadingRange("highlight words 4 to 200", text)).toThrow();
  expect(() =>
    localReadingRange(
      `highlight from 'same' to 'end'`,
      "same start end. same finish end.",
    ),
  ).toThrow(/repeats/);
});
it("creates a native selection across nested inline text and rejects a stale article", () => {
  document.body.innerHTML =
    "<main><p>The <em>difficult</em> receptor matters.</p><p>A second sentence.</p></main><nav><p>Private navigation</p></nav>";
  const reader = new ReadingRuntime(async () => {});
  const source = collectReading();
  expect(source.text).not.toContain("Private navigation");
  reader.select(4, 22, source.revision);
  expect(document.getSelection()?.toString()).toBe("difficult receptor");
  document.querySelector("em")!.textContent = "changed";
  expect(() => reader.select(4, 22, source.revision)).toThrow(/changed/);
  reader.destroy();
});
it("scratch restores only its verified edit including an intentional selection replacement", () => {
  document.body.innerHTML = '<textarea rows="8">Before old after</textarea>';
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 300,
    height: 100,
  } as DOMRect);
  const input = document.querySelector("textarea")!;
  const ledger = new EditLedger();
  input.setSelectionRange(7, 10);
  expect(ledger.insert(input, "new")).toBe(true);
  expect(input.value).toBe("Before new after");
  ledger.scratch();
  expect(input.value).toBe("Before old after");
  ledger.restore();
  expect(input.value).toBe("Before new after");
  input.value += " user edit";
  expect(() => ledger.scratch()).toThrow(/draft changed/);
  expect(input.value).toBe("Before new after user edit");
});
it("bounds the complete cleanup request and refuses ambiguous, truncated and negation-changing output", async () => {
  expect(() => ramblerMessages("a".repeat(6000))).toThrow();
  const messages = ramblerMessages("Um we will meet Tuesday, no Wednesday");
  expect(
    new TextEncoder().encode(JSON.stringify(messages)).length + 1228,
  ).toBeLessThanOrEqual(7000);
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              text: "We will meet Wednesday.",
              needsClarification: false,
              question: "",
            }),
          },
        },
      ],
    }),
  });
  vi.stubGlobal("fetch", fetch);
  expect(
    await cleanRamble("Um we will meet Tuesday, no Wednesday", {
      groqKeys: ["test-key"],
    }),
  ).toBe("We will meet Wednesday.");
  const payload = JSON.parse(fetch.mock.calls[0][1].body);
  expect(payload.max_completion_tokens).toBe(1100);
  expect(payload.messages).toHaveLength(2);
  expect(payload.messages[1].content).not.toContain("page");
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              text: "Send it.",
              needsClarification: false,
            }),
          },
        },
      ],
    }),
  });
  await expect(
    cleanRamble("Do not send it", { groqKeys: ["test-key"] }),
  ).rejects.toThrow(/negation/);
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ finish_reason: "length", message: { content: "{}" } }],
    }),
  });
  await expect(
    cleanRamble("Hello", { groqKeys: ["test-key"] }),
  ).rejects.toThrow(/incomplete/);
});

it("keeps decimal sentences together and validates cloud ranges at word boundaries", async () => {
  const text = "The rate is 3.5 percent. The final sentence has three words.";
  const range = localReadingRange("highlight sentence one", text)!;
  expect(text.slice(range.start, range.end)).toBe("The rate is 3.5 percent.");
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({ start: 4, end: 8, question: "" }),
          },
        },
      ],
    }),
  });
  vi.stubGlobal("fetch", fetch);
  expect(
    await resolveReadingRange("highlight the rate", text, {
      groqKeys: ["test-key"],
    }),
  ).toEqual({ start: 4, end: 8 });
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({ start: 5, end: 8, question: "" }),
          },
        },
      ],
    }),
  });
  await expect(
    resolveReadingRange("highlight the rate", text, { groqKeys: ["test-key"] }),
  ).rejects.toThrow(/whole words/);
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ finish_reason: "length", message: { content: "{}" } }],
    }),
  });
  await expect(
    resolveReadingRange("highlight the rate", text, { groqKeys: ["test-key"] }),
  ).rejects.toThrow(/incomplete/);
});

it("binds Docs edits to the local cursor instead of a collaborator or viewport position", () => {
  document.body.innerHTML =
    '<div class="kix-appview-editor"><div style="transform:translate(12px,20px)"><div class="kix-cursor-caret"></div></div><div id="local" style="transform:translate(50px,80px)"><div class="kix-cursor-caret" id="kix-current-user-cursor-caret"></div></div><svg class="kix-canvas-tile-content"><rect aria-label="Private draft"></rect></svg></div>';
  expect(docsSnapshot().caret).toBe("translate(50px,80px)");
  document.querySelector<HTMLElement>(
    ".kix-cursor-caret",
  )!.parentElement!.style.transform = "translate(999px,999px)";
  expect(docsSnapshot().caret).toBe("translate(50px,80px)");
  document.getElementById("local")!.style.transform = "translate(60px,80px)";
  expect(docsSnapshot().caret).toBe("translate(60px,80px)");
});

it("corrects spoken phrases regardless of case and removes a complete decimal sentence", () => {
  document.body.innerHTML = '<textarea rows="8"></textarea>';
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 300,
    height: 100,
  } as DOMRect);
  const input = document.querySelector("textarea")!,
    ledger = new EditLedger();
  ledger.insert(input, "Meet Tuesday. The rate is 3.5 percent.");
  ledger.replace("tuesday", "Wednesday");
  expect(input.value).toContain("Meet Wednesday.");
  ledger.sentence();
  expect(input.value).toBe("Meet Wednesday.");
});

it("keeps scratch limited to one Docs segment when native Undo groups two insertions", async () => {
  document.body.innerHTML =
    '<div class="kix-appview-editor"><div id="cursor" style="transform:translate(5px,0px)"><div id="kix-current-user-cursor-caret"></div></div><svg class="kix-canvas-tile-content"><rect aria-label="Base."></rect></svg></div><iframe class="docs-texteventtarget-iframe"></iframe>';
  const frame = document.querySelector("iframe")!;
  frame.contentDocument!.body.innerHTML =
    '<div contenteditable="true" tabindex="0"></div>';
  const set = (text: string) => {
    document.querySelector("rect")!.setAttribute("aria-label", text);
    document.getElementById("cursor")!.style.transform =
      `translate(${text.length}px,0px)`;
  };
  const input = vi.fn(
    async (text: string, command: string, expected: string) => {
      expect(docsSnapshot().text).toBe(expected);
      if (command === "scratch") set("Base.");
      else if (command === "insert") set(expected + text);
      else throw Error("Grouped undo must restore through its own insertion");
      return { ok: true };
    },
  );
  const editor = new GoogleDocsEditor(input);
  editor.focus();
  await editor.insert(" First.", "Base.", 0);
  const first = docsSnapshot().text;
  await editor.insert("Second.", first, 0);
  const both = docsSnapshot().text;
  await editor.scratch();
  expect(docsSnapshot().text).toBe(first);
  await editor.restore();
  expect(docsSnapshot().text).toBe(both);
  await editor.scratch();
  await editor.scratch();
  expect(docsSnapshot().text).toBe("Base.");
});
