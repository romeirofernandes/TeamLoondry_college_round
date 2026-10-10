// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ContentRuntime } from "../src/content/runtime";
import { defaults, type Message, type PointerSample } from "../src/shared";
import { insertText, PageTargets, usable } from "../src/content/dom";

let runtime: ContentRuntime;
let time = 0;
let sent: Message[] = [];
const rect = (top = 100, left = 100) => ({
  x: left,
  y: top,
  top,
  left,
  bottom: top + 40,
  right: left + 140,
  width: 140,
  height: 40,
  toJSON() {},
});
const pointer = (confidence = 1, handHold = false): Message => ({
  type: "POINTER",
  sample: {
    x: 150 / innerWidth,
    y: 120 / innerHeight,
    confidence,
    timestamp: time,
    source: "face",
    handHold,
    fps: 30,
    latencyMs: 12,
  } satisfies PointerSample,
});
const action = (
  type:
    "click" | "start-typing" | "submit" | "confirm" | "cancel" | "stop-typing",
) => runtime.handle({ type: "PAGE_ACTION", intent: { type } });

beforeEach(async () => {
  time = 0;
  sent = [];
  document.body.innerHTML =
    '<button id="button" type="button">Click me</button><form id="form"><input id="text" aria-label="Message"><button id="submit" type="submit">Send</button></form><input id="password" type="password"><input id="card" autocomplete="cc-number"><div id="editor" contenteditable="true">Draft</div>';
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return rect(this.id === "button" ? 100 : 500, 100);
    },
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => document.getElementById("button")),
  });
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  runtime = new ContentRuntime(
    async (message) => {
      sent.push(message);
    },
    () => time,
    false,
  );
  await runtime.handle({
    type: "PAGE_STATE",
    running: true,
    paused: false,
    dictating: false,
    settings: { ...defaults },
  });
});
afterEach(() => {
  runtime.destroy();
  vi.restoreAllMocks();
});

async function find(id: string) {
  const targets = (await runtime.handle({ type: "GET_TARGETS" })) as {
    id: string;
    text: string;
  }[];
  const label = document.getElementById(id)!;
  const target = targets.find(
    (candidate) =>
      candidate.text ===
      (label.getAttribute("aria-label") || label.textContent || id),
  );
  if (!target) throw new Error(`Missing test target ${id}`);
  await runtime.handle({ type: "FIND_RESULT", ids: [target.id] });
}

describe("page interactions", () => {
  it("dwell activates once, blocks low confidence, and requires renewed dwell after tracking loss", async () => {
    const click = vi.fn();
    document.getElementById("button")!.addEventListener("click", click);
    await runtime.handle(pointer());
    time = 500;
    await runtime.handle(pointer(0.2));
    time = 900;
    await runtime.handle(pointer());
    time = 1600;
    await runtime.handle(pointer());
    expect(click).not.toHaveBeenCalled();
    time = 1700;
    await runtime.handle(pointer());
    expect(click).toHaveBeenCalledTimes(1);
    time = 2800;
    await runtime.handle(pointer());
    expect(click).toHaveBeenCalledTimes(1);
  });
  it("freezes position and prevents activation while paused", async () => {
    const click = vi.fn();
    document.getElementById("button")!.addEventListener("click", click);
    await runtime.handle(pointer());
    await runtime.handle({
      type: "PAGE_STATE",
      running: true,
      paused: true,
      dictating: false,
      settings: { ...defaults },
    });
    time = 2000;
    await runtime.handle(pointer());
    await action("click");
    expect(click).not.toHaveBeenCalled();
  });
  it("voice-only find highlights without activating and explicit voice can click repeatedly", async () => {
    const click = vi.fn();
    document.getElementById("button")!.addEventListener("click", click);
    await find("button");
    time = 1200;
    runtime.tick();
    expect(click).not.toHaveBeenCalled();
    await action("click");
    await action("click");
    expect(click).toHaveBeenCalledTimes(2);
  });
  it("allows voice find after camera failure but blocks clicks on a pointer target after tracking loss", async () => {
    const click = vi.fn();
    document.getElementById("button")!.addEventListener("click", click);
    await runtime.handle(pointer());
    await runtime.handle(pointer(0));
    await action("click");
    expect(click).not.toHaveBeenCalled();
    await find("button");
    await action("click");
    expect(click).toHaveBeenCalledTimes(1);
  });
  it("confirms a submit button separately and cancels when the pointer target changes", async () => {
    const submit = vi.fn((event) => event.preventDefault());
    document.getElementById("form")!.addEventListener("submit", submit);
    await find("submit");
    await action("click");
    expect(submit).not.toHaveBeenCalled();
    await action("confirm");
    expect(submit).toHaveBeenCalledTimes(1);
    await action("click");
    await find("button");
    await action("confirm");
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it("expires a submit confirmation and cancels after a removed target", async () => {
    const submit = vi.fn((event) => event.preventDefault());
    document.getElementById("form")!.addEventListener("submit", submit);
    await find("submit");
    await action("click");
    time = 10001;
    await action("confirm");
    expect(submit).not.toHaveBeenCalled();
    await action("click");
    document.getElementById("submit")!.remove();
    await action("confirm");
    expect(submit).not.toHaveBeenCalled();
  });
  it("guards synchronous JavaScript submits from custom buttons while manual clicks remain usable", async () => {
    const button = document.getElementById("button")!;
    const form = document.getElementById("form") as HTMLFormElement;
    const submit = vi.fn((event) => event.preventDefault());
    form.addEventListener("submit", submit);
    button.addEventListener("click", () => form.requestSubmit());
    await find("button");
    await action("click");
    expect(submit).not.toHaveBeenCalled();
    await action("confirm");
    expect(submit).toHaveBeenCalledTimes(1);
    button.click();
    expect(submit).toHaveBeenCalledTimes(2);
  });
  it("retains a pointer activation latch across pause and resume", async () => {
    const click = vi.fn();
    document.getElementById("button")!.addEventListener("click", click);
    await runtime.handle(pointer());
    time = 400;
    await runtime.handle(pointer());
    time = 800;
    await runtime.handle(pointer());
    expect(click).toHaveBeenCalledTimes(1);
    await runtime.handle({
      type: "PAGE_STATE",
      running: true,
      paused: true,
      dictating: false,
      settings: { ...defaults },
    });
    time = 1200;
    await runtime.handle({
      type: "PAGE_STATE",
      running: true,
      paused: false,
      dictating: false,
      settings: { ...defaults },
    });
    await runtime.handle(pointer());
    time = 1600;
    await runtime.handle(pointer());
    time = 2000;
    await runtime.handle(pointer());
    expect(click).toHaveBeenCalledTimes(1);
  });
  it("requires a sustained gross hand hold with dwell disabled and cancels a released hold", async () => {
    const click = vi.fn();
    document.getElementById("button")!.addEventListener("click", click);
    await runtime.handle({
      type: "PAGE_STATE",
      running: true,
      paused: false,
      dictating: false,
      settings: { ...defaults, dwellEnabled: false },
    });
    await runtime.handle(pointer(1, true));
    time = 400;
    await runtime.handle(pointer(1, true));
    time = 500;
    await runtime.handle(pointer(1, false));
    time = 600;
    await runtime.handle(pointer(1, true));
    time = 1000;
    await runtime.handle(pointer(1, true));
    expect(click).not.toHaveBeenCalled();
    time = 1400;
    await runtime.handle(pointer(1, true));
    expect(click).toHaveBeenCalledTimes(1);
  });
  it("scrolls only after a confident edge hold and stops on confidence loss", async () => {
    const edgePointer = () =>
      ({
        ...pointer(),
        sample: {
          ...(pointer() as Extract<Message, { type: "POINTER" }>).sample,
          y: 0.999,
        },
      }) as Extract<Message, { type: "POINTER" }>;
    await runtime.handle(edgePointer());
    time = 400;
    await runtime.handle(edgePointer());
    time = 800;
    await runtime.handle(edgePointer());
    expect(window.scrollBy).not.toHaveBeenCalled();
    time = 1000;
    await runtime.handle(edgePointer());
    expect(window.scrollBy).toHaveBeenCalledTimes(1);
    time = 1700;
    const lost = edgePointer();
    lost.sample.confidence = 0;
    await runtime.handle(lost);
    expect(window.scrollBy).toHaveBeenCalledTimes(1);
  });
  it("dictates literal command phrases, preserves edits, and stops on focus changes", async () => {
    const field = document.getElementById("text") as HTMLInputElement;
    await find("text");
    await action("start-typing");
    const input = vi.fn();
    field.addEventListener("input", input);
    await runtime.handle({ type: "DICTATE", text: "go back" });
    expect(field.value).toBe("go back");
    expect(input).toHaveBeenCalledTimes(1);
    field.setSelectionRange(3, 7);
    await runtime.handle({ type: "DICTATE", text: "forward" });
    expect(field.value).toBe("go forward");
    document.getElementById("button")!.focus();
    await runtime.handle({ type: "DICTATE", text: "lost" });
    expect(field.value).toBe("go forward");
    expect(
      sent.some(
        (message) =>
          message.type === "SET_STATE" && message.patch.dictating === false,
      ),
    ).toBe(true);
  });
  it("blocks sensitive and readonly fields and safely inserts contenteditable text", () => {
    expect(insertText(document.getElementById("password")!, "secret")).toBe(
      false,
    );
    expect(insertText(document.getElementById("card")!, "1234")).toBe(false);
    const field = document.getElementById("text")!;
    field.setAttribute("readonly", "");
    expect(insertText(field, "hello")).toBe(false);
    const editor = document.getElementById("editor")!;
    expect(insertText(editor, "<script>bad()</script>")).toBe(true);
    expect(editor.querySelector("script")).toBeNull();
    expect(editor.textContent).toContain("<script>bad()</script>");
  });
  it("does not fall back to an old focused field when the selected target is sensitive", async () => {
    const field = document.getElementById("text") as HTMLInputElement;
    field.focus();
    const password = document.getElementById("password")!;
    (document.elementFromPoint as ReturnType<typeof vi.fn>).mockReturnValue(
      password,
    );
    await runtime.handle(pointer());
    expect(await action("start-typing")).toMatchObject({ ok: false });
    expect(
      await runtime.handle({ type: "DICTATE", text: "must not insert" }),
    ).toMatchObject({ ok: false });
    expect(field.value).toBe("");
    expect(
      sent.some(
        (message) =>
          message.type === "SET_STATE" && message.patch.dictating === true,
      ),
    ).toBe(false);
  });
  it("blocks a submit request on a pointer-selected field after confidence loss", async () => {
    const field = document.getElementById("text")!;
    (document.elementFromPoint as ReturnType<typeof vi.fn>).mockReturnValue(
      field,
    );
    await runtime.handle(pointer());
    await runtime.handle(pointer(0));
    expect(await action("submit")).toMatchObject({ ok: false });
    expect(await action("confirm")).toMatchObject({ ok: false });
  });
  it("returns text only, includes targets below viewport, and excludes the overlay", () => {
    document.getElementById("submit")!.getBoundingClientRect = () => rect(3000);
    const targets = new PageTargets().scan();
    expect(targets.some((target) => target.text === "Send")).toBe(true);
    expect(
      targets.every(
        (target) => Object.keys(target).sort().join(",") === "id,role,text",
      ),
    ).toBe(true);
    const host = document.getElementById("handsfree-assist-overlay")!;
    expect(host.style.pointerEvents).toBe("none");
    expect(
      targets.some((target) => target.text.includes("Handsfree is ready")),
    ).toBe(false);
  });
  it("excludes invisible ancestors and inherited pointer-events while allowing explicit child pointer events", () => {
    const group = document.createElement("div");
    const button = document.createElement("button");
    button.textContent = "Hidden control";
    group.append(button);
    document.body.append(group);
    group.style.opacity = "0";
    expect(usable(button)).toBe(false);
    expect(
      new PageTargets()
        .scan()
        .some((target) => target.text === "Hidden control"),
    ).toBe(false);
    group.style.opacity = "1";
    group.style.visibility = "hidden";
    expect(usable(button)).toBe(false);
    group.style.visibility = "visible";
    group.style.pointerEvents = "none";
    expect(usable(button)).toBe(false);
    button.style.pointerEvents = "auto";
    expect(usable(button)).toBe(true);
  });
  it("rejects snap candidates covered by a page layer but accepts visible descendants", () => {
    const button = document.getElementById("button")!;
    const child = document.createElement("span");
    button.append(child);
    const cover = document.createElement("div");
    document.body.append(cover);
    const hitTest = document.elementFromPoint as ReturnType<typeof vi.fn>;
    hitTest.mockReturnValue(cover);
    expect(new PageTargets().snap(70, 120)).toBeNull();
    hitTest.mockImplementation((x: number) =>
      x >= 100 ? child : document.body,
    );
    expect(new PageTargets().snap(70, 120)).toBe(button);
    hitTest.mockReturnValue(null);
    expect(
      new PageTargets().scan().some((target) => target.text === "Send"),
    ).toBe(true);
  });
  it("never serializes editable drafts as arbitrary-find labels", () => {
    const input = document.getElementById("text") as HTMLInputElement;
    input.value = "Private search query";
    const textarea = document.createElement("textarea");
    textarea.name = "comments";
    textarea.textContent = "Private multiline draft";
    const label = document.createElement("label");
    label.append("Comments", textarea);
    document.body.append(label);
    const editor = document.getElementById("editor")!;
    editor.setAttribute("aria-label", "Document editor");
    editor.textContent = "Private document draft";
    const nestedButton = document.createElement("button");
    nestedButton.textContent = "Private nested draft";
    editor.append(nestedButton);
    const labelledButton = document.createElement("button");
    labelledButton.setAttribute("aria-labelledby", "editor");
    labelledButton.title = "Safe fallback";
    document.body.append(labelledButton);
    const labels = new PageTargets().scan();
    expect(JSON.stringify(labels)).not.toContain("Private");
    expect(labels.some((target) => target.text === "Comments")).toBe(true);
    expect(labels.some((target) => target.text === "Safe fallback")).toBe(true);
    expect(labels.some((target) => target.text === "Document editor")).toBe(
      true,
    );
    expect(labels.some((target) => target.text === "Click me")).toBe(true);
    expect(labels.some((target) => target.text === "Message")).toBe(true);
  });
  it("asks on ties, chooses one target without activating it, and reports no match", async () => {
    const targets = (await runtime.handle({ type: "GET_TARGETS" })) as {
      id: string;
      text: string;
    }[];
    const click = vi.fn();
    document.getElementById("button")!.addEventListener("click", click);
    await runtime.handle({
      type: "FIND_RESULT",
      ids: targets.slice(0, 2).map((target) => target.id),
    });
    await runtime.handle(pointer());
    time = 1500;
    await runtime.handle(pointer());
    expect(
      sent.some(
        (message) =>
          message.type === "SET_STATE" &&
          message.patch.feedback?.includes("Several targets"),
      ),
    ).toBe(true);
    await runtime.handle({
      type: "PAGE_ACTION",
      intent: { type: "choose", index: 1 },
    });
    expect(click).not.toHaveBeenCalled();
    await action("click");
    expect(click).toHaveBeenCalledTimes(1);
    await runtime.handle({ type: "FIND_RESULT", ids: [] });
    await action("click");
    expect(click).toHaveBeenCalledTimes(1);
  });
});
