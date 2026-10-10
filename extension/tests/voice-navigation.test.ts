// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseIntent } from "../src/core/parser";
import { ContentRuntime } from "../src/content/runtime";
import { PageTargets } from "../src/content/dom";
import { defaults, type Intent, type Message } from "../src/shared";
it.each([
  ["click the first link", { type: "click-link", index: 1 }],
  ["Could you please open the second result in a new tab please?", { type: "click-link", index: 2, disposition: "new-tab" }],
  ["open the 10th link in a background tab", { type: "click-link", index: 10, disposition: "background" }],
  ["click 3rd result", { type: "click-link", index: 3 }],
  ["open the ChatGPT link in the background", { type: "click-target", query: "the chatgpt link", disposition: "background" }],
  ["focus the search box", { type: "focus-target", query: "search" }],
  ["focus Message", { type: "focus-target", query: "message" }],
  ["show links", { type: "show-links" }],
])("parses bounded local navigation: %s", (text, expected) => expect(parseIntent(text as string)).toEqual(expected));
it("does not interpret conversational ordinal references as activation", () => expect(parseIntent("my friend said click the first link").type).toBe("unknown"));
let runtime: ContentRuntime; let sent: Message[]; let hit: HTMLElement | null; let clicked: string[];
const run = (intent: Intent) => runtime.handle({ type: "PAGE_ACTION", intent });
beforeEach(async () => {
  document.body.innerHTML = '<nav><a id="nav" href="/menu">Menu</a></nav><main><input type="search" id="search" aria-label="Search"><article><a id="first" href="/first"><h2>ChatGPT</h2></a><a id="duplicate" href="/first"><h3>More about ChatGPT</h3></a></article><article><h2><a id="second" href="/second">Second guide</a></h2></article><a href="/hidden" hidden><h2>Hidden</h2></a><a href="/private" data-private><h2>Private</h2></a><input id="password" type="password" aria-label="Password"></main>';
  sent = []; clicked = []; hit = null;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 10, y: 10, top: 10, left: 10, right: 150, bottom: 50, width: 140, height: 40, toJSON() {} });
  HTMLElement.prototype.scrollIntoView = function() { hit = this; };
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => hit) });
  document.querySelectorAll("a").forEach(a => a.addEventListener("click", e => { e.preventDefault(); clicked.push(a.id); }));
  runtime = new ContentRuntime(async m => { sent.push(m); }, () => 0, false);
  await runtime.handle({ type: "PAGE_STATE", running: true, paused: false, dictating: false, settings: defaults });
});
afterEach(() => { runtime.destroy(); vi.restoreAllMocks(); });
it("ranks main heading links in document order and deduplicates destinations", async () => {
  await run({ type: "click-link", index: 1 }); await run({ type: "click-link", index: 2 }); expect(clicked).toEqual(["first", "second"]);
});
it("falls back to generic role and native links without result headings", async () => {
  document.body.innerHTML = '<a id="a" href="/a">A</a><span role="link" tabindex="0" id="b">B</span>';
  document.getElementById("b")!.addEventListener("click", () => clicked.push("b"));
  await run({ type: "click-link", index: 2 }); expect(clicked).toEqual(["b"]);
});
it("matches natural article/noun phrasing with literal label priority", async () => {
  await run({ type: "click-target", query: "the chatgpt link" }); expect(clicked).toEqual(["first"]);
  document.getElementById("second")!.textContent = "The ChatGPT link";
  await run({ type: "click-target", query: "the chatgpt link" }); expect(clicked).toEqual(["first", "second"]);
});
it("focuses only safe editable fields without typing or submitting", async () => {
  await run({ type: "focus-target", query: "search" }); expect(document.activeElement?.id).toBe("search");
  expect((document.getElementById("search") as HTMLInputElement).value).toBe("");
  await run({ type: "focus-target", query: "password" }); expect(document.activeElement?.id).toBe("search");
});
it("lists choices, selects without clicking, and rejects changed destinations", async () => {
  await run({ type: "show-links" }); await run({ type: "choose", index: 2 }); expect(clicked).toEqual([]);
  await run({ type: "click" }); expect(clicked).toEqual(["second"]);
  await run({ type: "show-links" }); document.getElementById("first")!.setAttribute("href", "/changed");
  expect(await run({ type: "choose", index: 1 })).toMatchObject({ ok: false });
});
it("never activates a link behind an occluding layer", async () => {
  const cover = document.createElement("div"); document.body.append(cover); vi.mocked(document.elementFromPoint).mockReturnValue(cover);
  await run({ type: "click-link", index: 1 }); expect(clicked).toEqual([]);
});
it("prepares only http links for worker-authorized tab opening and validates the selection again", async () => {
  const result = await run({ type: "click-link", index: 2, disposition: "background" }) as any;
  expect(result.link).toMatchObject({ url: new URL("/second", location.href).href, pageUrl: location.href }); expect(clicked).toEqual([]);
  expect(await runtime.handle({ type: "VALIDATE_LINK", ...result.link })).toMatchObject({ ok: true });
  document.getElementById("second")!.setAttribute("href", "javascript:alert(1)");
  expect(await runtime.handle({ type: "VALIDATE_LINK", ...result.link })).toMatchObject({ ok: false });
});
it("does not list private or aria-hidden candidates", () => {
  document.getElementById("first")!.setAttribute("aria-hidden", "true"); document.getElementById("duplicate")!.setAttribute("data-private", ""); const targets = new PageTargets();
  expect(targets.links().map(id => targets.get(id)?.id)).toEqual(["second"]); targets.destroy();
});
it("rechecks occlusion after a numbered choice before current-page activation", async () => {
  await run({ type: "show-links" }); await run({ type: "choose", index: 1 });
  const cover = document.createElement("div"); document.body.append(cover); vi.mocked(document.elementFromPoint).mockReturnValue(cover);
  await run({ type: "click" }); expect(clicked).toEqual([]);
});
it("keeps literal focus labels before generic search semantics and excludes private fields", async () => {
  document.body.insertAdjacentHTML("beforeend", '<input id="other-search" aria-label="Other search"><input id="private-field" data-private aria-label="Search">');
  await run({ type: "focus-target", query: "search" }); expect(document.activeElement?.id).toBe("search");
});
it("requires a choice for duplicate safe field labels and blocks paused or dictating navigation", async () => {
  document.body.insertAdjacentHTML("beforeend", '<input aria-label="Search">');
  await run({ type: "focus-target", query: "search" }); expect(document.activeElement?.id).not.toBe("search");
  await runtime.handle({ type: "PAGE_STATE", running: true, paused: true, dictating: false, settings: defaults });
  expect(await run({ type: "click-link", index: 1 })).toMatchObject({ ok: false });
  await runtime.handle({ type: "PAGE_STATE", running: true, paused: false, dictating: false, settings: defaults });
  document.querySelector('input[aria-label="Search"]:not(#search)')!.remove();
  await run({ type: "focus-target", query: "search" }); await run({ type: "start-typing" });
  expect(await run({ type: "click-link", index: 1 })).toMatchObject({ ok: false }); expect(clicked).toEqual([]);
});
it("does not reuse a changed selected link or navigation choice", async () => {
  await run({ type: "show-links" }); await run({ type: "choose", index: 1 });
  document.getElementById("first")!.setAttribute("href", "/changed");
  expect(await run({ type: "click" })).toMatchObject({ ok: false }); expect(clicked).toEqual([]);
  await run({ type: "show-links" }); history.pushState({}, "", "/changed-page");
  expect(await run({ type: "choose", index: 1 })).toMatchObject({ ok: false }); history.replaceState({}, "", "/");
});
it("rechecks an explicitly selected submit control before confirmation", async () => {
  document.body.insertAdjacentHTML("beforeend", '<form id="safe-form"><button type="submit" id="send">Send form</button></form>');
  const submitted = vi.fn((event: Event) => event.preventDefault());
  document.getElementById("safe-form")!.addEventListener("submit", submitted);
  await run({ type: "click-target", query: "Send form" });
  const cover = document.createElement("div"); document.body.append(cover); vi.mocked(document.elementFromPoint).mockReturnValue(cover);
  expect(await run({ type: "confirm" })).toMatchObject({ ok: false }); expect(submitted).not.toHaveBeenCalled();
});
it("resolves ordinal links from the current DOM after removal", async () => {
  document.getElementById("first")!.remove(); document.getElementById("duplicate")!.remove();
  await run({ type: "click-link", index: 1 }); expect(clicked).toEqual(["second"]);
});
