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
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function(this: HTMLElement) { return [this.getBoundingClientRect()] as unknown as DOMRectList; });
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
  vi.unstubAllGlobals();
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
    vi.mocked(document.elementFromPoint).mockReturnValue(document.getElementById("submit"));
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
    vi.mocked(document.elementFromPoint).mockReturnValue(document.getElementById("submit"));
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
    expect((window.scrollBy as ReturnType<typeof vi.fn>).mock.calls[0][0].top).toBeLessThan(60);
    time = 1016;
    runtime.tick();
    expect(window.scrollBy).toHaveBeenCalledTimes(2);
    time = 1700;
    const lost = edgePointer();
    lost.sample.confidence = 0;
    await runtime.handle(lost);
    expect(window.scrollBy).toHaveBeenCalledTimes(2);
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

describe('named targets and safe page answers', () => {
  it('activates a literal exact label ahead of broader matches and hidden controls', async () => {
    document.body.insertAdjacentHTML('beforeend', '<button id="literal">C++ (Guide)</button><button id="broader">C++ (Guide) archive</button><button hidden>C++ (Guide)</button>');
    const clicked: string[] = [];
    for (const id of ['literal', 'broader']) document.getElementById(id)!.addEventListener('click', () => clicked.push(id));
    vi.mocked(document.elementFromPoint).mockReturnValue(document.getElementById('literal'));
    await runtime.handle({ type: 'PAGE_ACTION', intent: { type: 'click-target', query: 'C++ (Guide)' } });
    expect(clicked).toEqual(['literal']);
  });
  it('requires a numbered choice for duplicate labels and preserves submit confirmation', async () => {
    document.body.insertAdjacentHTML('beforeend', '<button id="other-send">Send</button>');
    const submitted = vi.fn((event: Event) => event.preventDefault());
    document.getElementById('form')!.addEventListener('submit', submitted);
    await runtime.handle({ type: 'PAGE_ACTION', intent: { type: 'click-target', query: 'Send' } });
    expect(submitted).not.toHaveBeenCalled();
    expect(sent.some(m => m.type === 'SET_STATE' && m.patch.feedback?.includes('Several targets'))).toBe(true);
    await runtime.handle({ type: 'PAGE_ACTION', intent: { type: 'choose', index: 1 } });
    vi.mocked(document.elementFromPoint).mockReturnValue(document.getElementById('submit'));
    await action('click');
    expect(submitted).not.toHaveBeenCalled();
    await action('confirm');
    expect(submitted).toHaveBeenCalledOnce();
  });
  it('ranks whole words before substrings without interpreting regex metacharacters', async () => {
    document.body.insertAdjacentHTML('beforeend', '<button id="substring">Supporter</button><button id="word">Get support</button><button id="pattern">Anything</button>');
    const clicked: string[] = [];
    for (const id of ['substring', 'word', 'pattern']) document.getElementById(id)!.addEventListener('click', () => clicked.push(id));
    vi.mocked(document.elementFromPoint).mockReturnValue(document.getElementById('word'));
    await runtime.handle({ type: 'PAGE_ACTION', intent: { type: 'click-target', query: 'support' } });
    await runtime.handle({ type: 'PAGE_ACTION', intent: { type: 'click-target', query: '.*' } });
    expect(clicked).toEqual(['word']);
  });
  it('bounds page context and excludes hidden, private, editable, script and extension text', async () => {
    document.title = 'Public article';
    document.body.insertAdjacentHTML('beforeend', '<p>Public explanation</p><div hidden>HIDDEN_SECRET</div><div style="display:none">STYLE_SECRET</div><textarea>TEXTAREA_SECRET</textarea><div contenteditable="plaintext-only">EDITOR_SECRET</div><script>SCRIPT_SECRET</script><div data-private>PRIVATE_SECRET</div><p>' + 'a'.repeat(13000) + '</p>');
    document.getElementById('password')!.setAttribute('value', 'PASSWORD_SECRET');
    const context = await runtime.handle({ type: 'GET_PAGE_CONTEXT' }) as { title: string; url: string; text: string };
    expect(context.title).toBe('Public article');
    expect(context.text).toContain('Public explanation');
    expect(context.text.length).toBeLessThanOrEqual(12000);
    expect(context.text).not.toMatch(/SECRET|Draft|Handsfree is ready/);
  });
  it('renders answer markup literally and does not activate interim transcripts', async () => {
    const clicked = vi.fn();
    document.getElementById('button')!.addEventListener('click', clicked);
    await runtime.handle(pointer());
    await runtime.handle({ type: 'TRANSCRIPT', text: 'click this', final: false });
    await runtime.handle({ type: 'ANSWER', text: '<img src=x onerror=alert(1)> Answer' });
    const shadow = document.getElementById('handsfree-assist-overlay')!.shadowRoot!;
    expect(shadow.querySelector('.feedback')!.textContent).toBe('<img src=x onerror=alert(1)> Answer');
    expect(shadow.querySelector('img')).toBeNull();
    expect(clicked).not.toHaveBeenCalled();
  });
});

describe('literal ranking boundaries', () => {
  it('recognizes a later whole-word occurrence ahead of a substring-only label', async () => {
    document.body.insertAdjacentHTML('beforeend', '<button id="later-word">Supporters get support</button><button id="substring-only">Supporter</button><button id="private-label" data-private>Support</button>');
    const clicked: string[] = [];
    for (const id of ['later-word', 'substring-only', 'private-label']) document.getElementById(id)!.addEventListener('click', () => clicked.push(id));
    vi.mocked(document.elementFromPoint).mockReturnValue(document.getElementById('later-word'));
    await runtime.handle({ type: 'PAGE_ACTION', intent: { type: 'click-target', query: 'support' } });
    expect(clicked).toEqual(['later-word']);
  });
});

describe("thumbnail and title snapping", () => {
  function card() {
    document.body.insertAdjacentHTML("beforeend", '<ytd-rich-item-renderer id="video-card"><ytd-thumbnail id="thumb-wrap"><a id="thumb" href="/watch?v=one"><img id="preview"></a></ytd-thumbnail><a id="title" href="/watch?v=one">Video title</a><a id="channel" href="/channel/other">Channel</a></ytd-rich-item-renderer>');
    const thumb = document.getElementById("thumb")!;
    const title = document.getElementById("title")!;
    const channel = document.getElementById("channel")!;
    thumb.getBoundingClientRect = () => ({ ...rect(100, 400), width: 300, height: 180, right: 700, bottom: 280 });
    title.getBoundingClientRect = () => rect(285, 400);
    channel.getBoundingClientRect = () => rect(330, 400);
    return { thumb, title, channel };
  }
  it("allows a visibly clickable aria-hidden YouTube thumbnail while preserving private context exclusions", async () => {
    const { thumb, title } = card();
    thumb.setAttribute("aria-hidden", "true");
    thumb.insertAdjacentHTML("beforeend", "<span>ARIA_HIDDEN_SECRET</span>");
    const clicked = vi.fn((event: Event) => event.preventDefault());
    thumb.addEventListener("click", clicked);
    title.addEventListener("click", clicked);
    const hit = document.elementFromPoint as ReturnType<typeof vi.fn>;
    hit.mockImplementation((_x: number, y: number) => y < 280 ? thumb : title);
    const targets = new PageTargets();
    expect(targets.snap(500, 200)).toBe(thumb);
    expect(targets.snap(500, 300, thumb)).toBe(thumb);
    const point = (y: number) => ({ type: "POINTER", sample: { ...(pointer() as Extract<Message, { type: "POINTER" }>).sample, x: 500 / innerWidth, y: y / innerHeight } } as Message);
    await runtime.handle(point(200));
    time = 400;
    await runtime.handle(point(300));
    expect(clicked).not.toHaveBeenCalled();
    time = 800;
    await runtime.handle(point(200));
    expect(clicked).toHaveBeenCalledOnce();
    const context = await runtime.handle({ type: "GET_PAGE_CONTEXT" }) as { text: string };
    expect(context.text).not.toContain("ARIA_HIDDEN_SECRET");
    for (const attr of ["hidden", "inert"]) {
      thumb.setAttribute(attr, "");
      expect(usable(thumb)).toBe(false);
      thumb.removeAttribute(attr);
    }
    thumb.style.display = "none";
    expect(usable(thumb)).toBe(false);
    targets.destroy();
  });
  it("resolves an exposed thumbnail wrapper to its actual descendant link", () => {
    const { thumb } = card();
    const hit = document.elementFromPoint as ReturnType<typeof vi.fn>;
    hit.mockReturnValue(document.getElementById("thumb-wrap"));
    expect(new PageTargets().snap(600, 200)).toBe(thumb);
  });
  it("keeps equivalent thumbnail/title links stable within one card and preserves unrelated controls", () => {
    const { thumb, title, channel } = card();
    const targets = new PageTargets();
    const hit = document.elementFromPoint as ReturnType<typeof vi.fn>;
    hit.mockImplementation((_x: number, y: number) => y < 280 ? thumb : y < 325 ? title : channel);
    const selected = targets.snap(500, 200);
    expect(selected).toBe(thumb);
    expect(targets.snap(500, 300, selected)).toBe(thumb);
    expect(targets.snap(500, 340, selected)).toBe(channel);
  });
  it("blocks a covered thumbnail before the visibility index has delivered entries", () => {
    const { thumb, title } = card();
    const cover = document.createElement("div");
    document.body.append(cover);
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
    Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: vi.fn(() => [cover, thumb, document.body]) });
    const hit = document.elementFromPoint as ReturnType<typeof vi.fn>;
    hit.mockImplementation((_x: number, y: number) => y < 280 ? cover : title);
    const targets = new PageTargets();
    const selected = targets.snap(500, 270);
    targets.destroy();
    delete (document as unknown as Record<string, unknown>).elementsFromPoint;
    expect(selected).toBeNull();
  });
  it("retains one dwell timer and activation latch when crossing thumbnail and title", async () => {
    const { thumb, title } = card();
    const clicked = vi.fn((event: Event) => event.preventDefault());
    thumb.addEventListener("click", clicked);
    title.addEventListener("click", clicked);
    const hit = document.elementFromPoint as ReturnType<typeof vi.fn>;
    hit.mockImplementation((_x: number, y: number) => y < 280 ? thumb : title);
    const point = (y: number) => ({ type: "POINTER", sample: { ...(pointer() as Extract<Message, { type: "POINTER" }>).sample, x: 500 / innerWidth, y: y / innerHeight } } as Message);
    await runtime.handle(point(200));
    time = 400;
    await runtime.handle(point(300));
    expect(clicked).not.toHaveBeenCalled();
    time = 800;
    await runtime.handle(point(200));
    expect(clicked).toHaveBeenCalledOnce();
    time = 1200;
    await runtime.handle(point(300));
    expect(clicked).toHaveBeenCalledOnce();
  });
  it("does not select covered thumbnail links or reuse an occluded equivalent target", () => {
    const { thumb, title } = card();
    const cover = document.createElement("div");
    document.body.append(cover);
    const hit = document.elementFromPoint as ReturnType<typeof vi.fn>;
    hit.mockImplementation((_x: number, y: number) => y < 280 ? cover : title);
    const targets = new PageTargets();
    expect(targets.snap(500, 270)).toBeNull();
    expect(targets.snap(500, 300, thumb)).toBe(title);
  });
});

describe("smooth scrolling", () => {
  const scroll = () => runtime.handle({ type: "PAGE_ACTION", intent: { type: "scroll", direction: "down" } });
  const distance = () => (window.scrollBy as ReturnType<typeof vi.fn>).mock.calls.reduce((sum, call) => sum + call[0].top, 0);
  it("animates voice scrolling without any calibrated or confident pointer in small frame increments", async () => {
    await scroll();
    expect(distance()).toBe(0);
    for (time = 16; time <= 480; time += 16) runtime.tick();
    expect(distance()).toBeCloseTo(Math.max(200, innerHeight * 0.65));
    const calls = (window.scrollBy as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(15);
    expect(calls.every(call => call[0].top > 0 && call[0].top < 80)).toBe(true);
  });
  it("lets an explicit opposite voice scroll take priority over a held edge", async () => {
    const edge = () => ({ type: "POINTER", sample: { ...(pointer() as Extract<Message, { type: "POINTER" }>).sample, y: 0.999 } } as Message);
    await runtime.handle(edge());
    time = 500;
    await runtime.handle(edge());
    time = 1000;
    await runtime.handle(edge());
    const before = distance();
    await runtime.handle({ type: "PAGE_ACTION", intent: { type: "scroll", direction: "up" } });
    for (time = 1016; time < 1400; time += 16) runtime.tick();
    expect(distance()).toBeLessThan(before);
  });
  it("scales voice distance with scrollSensitivity and uses immediate scrolling for reduced motion", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    await runtime.handle({ type: "PAGE_STATE", running: true, paused: false, dictating: false, settings: { ...defaults, scrollSensitivity: 2 } });
    await scroll();
    expect(distance()).toBeCloseTo(Math.max(200, innerHeight * 0.65) * 2);
    time = 100;
    runtime.tick();
    expect(window.scrollBy).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
  it("continues an intentional voice scroll through tracking loss and cancels it on pause", async () => {
    await runtime.handle(pointer());
    await scroll();
    time = 16;
    runtime.tick();
    const moved = distance();
    await runtime.handle(pointer(0));
    time = 100;
    runtime.tick();
    expect(distance()).toBeGreaterThan(moved);
    const afterLoss = distance();
    await scroll();
    await runtime.handle({ type: "PAGE_STATE", running: true, paused: true, dictating: false, settings: { ...defaults } });
    time = 200;
    runtime.tick();
    expect(distance()).toBe(afterLoss);
  });
  it("scrolls the nearest available container and falls back to the page at its boundary", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const pane = document.createElement("section");
    pane.style.overflowY = "auto";
    const button = document.getElementById("button")!;
    pane.append(button);
    document.body.append(pane);
    Object.defineProperties(pane, { scrollHeight: { value: 2000 }, clientHeight: { value: 300 } });
    pane.scrollBy = vi.fn();
    await runtime.handle(pointer());
    await scroll();
    expect(pane.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ top: Math.max(200, innerHeight * 0.65) }));
    expect(window.scrollBy).not.toHaveBeenCalled();
    pane.scrollTop = 1700;
    await scroll();
    expect(window.scrollBy).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
  it("stops continuous edge motion after leaving the edge or pausing", async () => {
    const edge = () => ({ type: "POINTER", sample: { ...(pointer() as Extract<Message, { type: "POINTER" }>).sample, y: 0.999 } } as Message);
    await runtime.handle(edge());
    time = 500;
    await runtime.handle(edge());
    time = 1000;
    await runtime.handle(edge());
    const moved = distance();
    expect(moved).toBeGreaterThan(0);
    time = 1016;
    await runtime.handle(pointer());
    time = 1032;
    runtime.tick();
    expect(distance()).toBe(moved);
    await runtime.handle(edge());
    time = 1500;
    await runtime.handle(edge());
    time = 2000;
    await runtime.handle(edge());
    await runtime.handle({ type: "PAGE_STATE", running: true, paused: true, dictating: false, settings: { ...defaults } });
    const pausedDistance = distance();
    time = 2100;
    runtime.tick();
    expect(distance()).toBe(pausedDistance);
  });
});


describe("cursor preferences preserve dwell", () => {
  it("changes trusted cursor icons without resetting an in-progress dwell or activation latch", async () => {
    const clicked = vi.fn();
    document.getElementById("button")!.addEventListener("click", clicked);
    await runtime.handle(pointer());
    time = 400;
    await runtime.handle(pointer());
    const shadow = document.getElementById("handsfree-assist-overlay")!.shadowRoot!;
    const ring = shadow.querySelector(".dwell-ring circle") as SVGCircleElement;
    expect(ring?.style.strokeDashoffset).toBe("50");
    for (const cursorStyle of ["arrow", "crosshair", "spark", "circle"] as const) {
      await runtime.handle({ type: "PAGE_STATE", running: true, paused: false, dictating: false, settings: { ...defaults, cursorStyle } });
      expect(shadow.querySelector(".cursor")!.getAttribute("data-style")).toBe(cursorStyle);
      expect(shadow.querySelector(`.cursor-icon[data-icon="${cursorStyle}"]`)).not.toBeNull();
      expect(shadow.querySelector(".dwell-ring circle")).toBe(ring);
      expect(ring.style.strokeDashoffset).toBe("50");
    }
    time = 800;
    await runtime.handle(pointer());
    expect(clicked).toHaveBeenCalledTimes(1);
    time = 1200;
    await runtime.handle(pointer());
    expect(clicked).toHaveBeenCalledTimes(1);
  });
});
