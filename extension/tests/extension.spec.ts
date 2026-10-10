import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Message } from "../src/shared";
let context: BrowserContext;
let worker: Worker;
let controls: Page;
let page: Page;
let staging: string;
async function message<T = any>(msg: Message): Promise<T> {
  return controls.evaluate(async (msg) => chrome.runtime.sendMessage(msg), msg);
}
async function point(selector: string, confidence = 1) {
  // These command cases supply deterministic pointer samples. Blank fake-camera
  // inference must not replace them; capture lifecycle tests keep inference live.
  await message({ type: "OFFSCREEN_COMMAND", command: "pause" });
  await page.locator(selector).scrollIntoViewIfNeeded();
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error("No target");
  const viewport = page.viewportSize()!;
  await message({
    type: "POINTER",
    sample: {
      x: (box.x + box.width / 2) / viewport.width,
      y: (box.y + box.height / 2) / viewport.height,
      confidence,
      timestamp: Date.now(),
      source: "face",
      handHold: false,
      fps: 30,
      latencyMs: 15,
    },
  });
}
async function heard(text: string) {
  // Mirror the final recognition callback, including the passive transcript.
  await message({ type: "TRANSCRIPT", text, final: true });
  await message({ type: "HEARD", text });
}
test.beforeAll(async () => {
  staging = await mkdtemp(path.join(os.tmpdir(), "handsfree-e2e-"));
  const dist = path.join(staging, "extension");
  await cp(path.resolve("dist"), dist, { recursive: true });
  // Permission prerequisites are granted at install only in this isolated fixture.
  // The production manifest keeps tabs and webpage origins optional.
  const manifest = JSON.parse(
    await readFile(path.join(dist, "manifest.json"), "utf8"),
  );
  manifest.permissions.push("tabs");
  manifest.host_permissions = ["http://127.0.0.1/*", "http://localhost/*"];
  await writeFile(path.join(dist, "manifest.json"), JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(
    path.join(staging, "profile"),
    {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      headless: true,
      viewport: { width: 1280, height: 900 },
      args: [
        `--disable-extensions-except=${dist}`,
        `--load-extension=${dist}`,
        "--no-sandbox",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    },
  );
  worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const id = worker.url().split("/")[2];
  controls = await context.newPage();
  await controls.goto(`chrome-extension://${id}/popup.html`);
  page = await context.newPage();
  await page.goto("http://127.0.0.1:4177");
  const tabId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: "http://127.0.0.1:4177/*" });
    return tabs[0].id!;
  });
  await message({ type: "SAVE_PROVIDERS", groqKeys: [], jevKey: "" });
  await message({ type: "START", tabId });
  await expect(page.locator("#handsfree-assist-overlay")).toBeAttached();
  await message({
    type: "SAVE_SETTINGS",
    settings: {
      ...(await message({ type: "GET_SETTINGS" })),
      dwellEnabled: false,
    },
  });
});
test.beforeEach(async () => {
  await page.goto("http://127.0.0.1:4177");
  const tabId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: "http://127.0.0.1:4177/" });
    return tabs[0].id!;
  });
  await message({ type: "START", tabId });
  await expect(page.locator("#handsfree-assist-overlay")).toBeAttached();
});
test.afterAll(async () => {
  await context?.close();
  if (staging) await rm(staging, { recursive: true, force: true });
});
test("actual content script points, clicks, and leaves native page clicks usable", async () => {
  await point("#count");
  await heard("click this");
  await expect(page.locator("#clicks")).toHaveText("1");
  await page.locator("#count").click();
  await expect(page.locator("#clicks")).toHaveText("2");
  expect(
    await page
      .locator("#handsfree-assist-overlay")
      .evaluate((el) => getComputedStyle(el).pointerEvents),
  ).toBe("none");
});

test("voice controls the main media in a cross-origin iframe", async () => {
  await message({ type: "OFFSCREEN_COMMAND", command: "pause" });
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.id = "media-frame"; frame.src = "http://localhost:4177/media";
    frame.width = "660"; frame.height = "380";
    document.body.prepend(frame);
  });
  const player = page.frameLocator("#media-frame").locator("#player");
  await expect.poll(() => player.evaluate((video: HTMLVideoElement) => video.duration)).toBe(15);
  await heard("play the video");
  await expect.poll(() => player.evaluate((video: HTMLVideoElement) => video.paused)).toBe(false);
  await heard("pause video");
  await expect.poll(() => player.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
  await player.evaluate((video: HTMLVideoElement) => { video.currentTime = 5; });
  await expect.poll(() => player.evaluate((video: HTMLVideoElement) => video.currentTime)).toBe(5);
  await heard("forward five seconds");
  await expect.poll(() => player.evaluate((video: HTMLVideoElement) => video.currentTime)).toBe(10);
  await heard("rewind five seconds");
  await expect.poll(() => player.evaluate((video: HTMLVideoElement) => video.currentTime)).toBe(5);
});

test("plain click activates an unsnapped hit area at its coordinates", async () => {
  await page.evaluate(() => {
    const area = document.createElement("div"); area.id = "free-area";
    area.style.cssText = "position:fixed;top:10px;left:10px;width:80px;height:80px;background:lime;z-index:10";
    area.textContent = "0"; area.addEventListener("click", event => { area.textContent = `${event.clientX},${event.clientY}`; });
    document.body.append(area);
  });
  await point("#free-area");
  await heard("click");
  await expect(page.locator("#free-area")).toHaveText("50,50");
});

test("custom pause and resume keywords gate page and tab actions", async () => {
  const original = await message({ type: "GET_SETTINGS" });
  await message({ type: "SAVE_SETTINGS", settings: { ...original, pausePhrase: "take a break", resumePhrase: "carry on" } });
  try {
    await heard("take a break");
    expect((await message({ type: "GET_STATE" })).paused).toBe(true);
    await heard("click");
    await expect(page.locator("#clicks")).toHaveText("0");
    await heard("carry on");
    expect((await message({ type: "GET_STATE" })).paused).toBe(false);
    await point("#count"); await heard("click");
    await expect(page.locator("#clicks")).toHaveText("1");
  } finally { await message({ type: "SAVE_SETTINGS", settings: original }); }
});
test("dictation words do not navigate; submission requires confirmation", async () => {
  await point("#search");
  await heard("start typing");
  await heard("scroll down");
  await heard("hello world");
  await expect(page.locator("#search")).toHaveValue("scroll down hello world");
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await heard("stop typing");
  await point("#search");
  await heard("submit form");
  await expect(page.locator("#submissions")).toHaveText("0");
  await point("#search");
  await heard("confirm");
  await expect(page.locator("#submissions")).toHaveText("1");
  await point("#password");
  await heard("start typing");
  expect((await message({ type: "GET_STATE" })).dictating).toBe(false);
});
test("low confidence and pause block activation; escape pauses immediately", async () => {
  await point("#count", 0);
  await heard("click this");
  await expect(page.locator("#clicks")).toHaveText("0");
  await message({ type: "PAUSE" });
  await point("#count");
  await heard("click this");
  await expect(page.locator("#clicks")).toHaveText("0");
  await message({ type: "RESUME" });
  await point("#count");
  await heard("click this");
  await expect(page.locator("#clicks")).toHaveText("1");
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => (await message({ type: "GET_STATE" })).paused)
    .toBe(true);
  await message({ type: "RESUME" });
});
test("unknown phrases and missing-key find are explicit no-ops", async () => {
  await heard("this is not a command");
  expect((await message({ type: "GET_STATE" })).feedback).toContain(
    "No command matched",
  );
  await heard("hey handsfree find careers page");
  expect((await message({ type: "GET_STATE" })).feedback).toContain(
    "Add a Groq key",
  );
  const targets = await worker.evaluate(async () => {
    const { state } = await chrome.storage.session.get("state");
    return chrome.tabs.sendMessage((state as any).targetTabId, {
      type: "GET_TARGETS",
    });
  });
  expect(targets.some((target: any) => target.text === "Explore careers")).toBe(
    true,
  );
});
test("tab switch by title works and closing always requires confirmation", async () => {
  const second = await context.newPage();
  await second.goto("http://127.0.0.1:4177/second");
  await expect
    .poll(async () => (await message({ type: "GET_STATE" })).targetTabId)
    .not.toBe(null);
  await heard("show tabs");
  const tabFeedback = (await message({ type: "GET_STATE" })).feedback as string;
  expect(tabFeedback).toContain("Handsfree test page");
  expect(tabFeedback).toContain("Second Handsfree page");
  const secondTabNumber = tabFeedback.match(/(\d+)\. Second Handsfree page/)?.[1];
  expect(secondTabNumber).toBeTruthy();
  await heard(`go to tab ${secondTabNumber}`);
  await expect
    .poll(async () =>
      worker.evaluate(async () => {
        const { state } = await chrome.storage.session.get("state");
        return (await chrome.tabs.get((state as any).targetTabId)).title;
      }),
    )
    .toBe("Second Handsfree page");
  await heard("go to tab handsfree test page");
  await expect
    .poll(async () =>
      worker.evaluate(async () => {
        const { state } = await chrome.storage.session.get("state");
        const tab = await chrome.tabs.get((state as any).targetTabId);
        return tab.title;
      }),
    )
    .toBe("Handsfree test page");
  await heard("go to tab second handsfree page");
  await expect
    .poll(async () =>
      worker.evaluate(async () => {
        const { state } = await chrome.storage.session.get("state");
        const tab = await chrome.tabs.get((state as any).targetTabId);
        return tab.title;
      }),
    )
    .toBe("Second Handsfree page");
  await heard("close this tab");
  expect(second.isClosed()).toBe(false);
  await heard("cancel");
  expect(second.isClosed()).toBe(false);
  await heard("close tab");
  await heard("confirm");
  await expect.poll(() => second.isClosed()).toBe(true);
});
async function offscreenCount() {
  return worker.evaluate(async () => (await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  })).length);
}
async function dashboardRequest<T = any>(dashboard: Page, request: unknown): Promise<T> {
  return dashboard.evaluate((message) => new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { removeEventListener("message", listener); reject(new Error("Dashboard bridge timed out")); }, 5000);
    function listener(event: MessageEvent) {
      if (event.source !== window || event.origin !== location.origin || event.data?.channel !== "handsfree-dashboard-response" || event.data.id !== id) return;
      clearTimeout(timer); removeEventListener("message", listener); resolve(event.data.result);
    }
    addEventListener("message", listener);
    window.postMessage({ channel: "handsfree-dashboard-request", id, message }, location.origin);
  }), request) as Promise<T>;
}

test("minimal popup previews camera; capture survives popup close and webpage navigation", async () => {
  const id = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await expect(popup.getByRole("button", { name: "Open dashboard" })).toBeVisible();
  await expect(popup.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect.poll(async () => (await message({ type: "GET_STATE" })).trackingBackend, { timeout: 30000 }).toBe("Worker / CPU");
  await expect.poll(() => popup.locator("video").evaluate(el => {
    const stream = (el as HTMLVideoElement).srcObject as MediaStream | null;
    return stream?.getVideoTracks()[0]?.readyState;
  })).toBe("live");
  await popup.getByRole("button", { name: "Pause", exact: true }).click();
  await expect.poll(async () => (await message({ type: "GET_STATE" })).paused).toBe(true);
  await popup.getByRole("button", { name: "Resume", exact: true }).click();
  await expect.poll(async () => (await message({ type: "GET_STATE" })).paused).toBe(false);
  await popup.close();
  await page.bringToFront();
  await page.goto("http://127.0.0.1:4177/second");
  await expect(page.locator("#handsfree-assist-overlay")).toBeAttached();
  expect((await message({ type: "GET_STATE" })).running).toBe(true);
  expect(await offscreenCount()).toBe(1);
  // Clear the previous timing value so this requires fresh offscreen inference.
  await message({ type: "SET_STATE", patch: { latencyMs: 0 } });
  await expect.poll(async () => (await message({ type: "GET_STATE" })).latencyMs).toBeGreaterThan(0);
  await message({ type: "STOP" });
  await expect.poll(offscreenCount).toBe(0);
  const stopped = await message({ type: "GET_STATE" });
  expect(stopped.running).toBe(false);
  expect(stopped.camera).toBe("Off");
  expect(stopped.voice).toBe("Off");
});

test("website dashboard exchanges state and settings without exposing stored provider keys", async () => {
  expect(await message({ type: "SET_DASHBOARD_URL", url: "http://127.0.0.1:4177/dashboard" })).toEqual({ok:true});
  const opened = context.waitForEvent("page");
  await message({ type: "OPEN_DASHBOARD" });
  const dashboard = await opened;
  dashboard.on("requestfailed",r=>console.log("Dashboard request failed:",r.url(),r.failure()?.errorText));
  await dashboard.waitForURL("http://127.0.0.1:4177/dashboard#overview");
  await dashboard.waitForLoadState("load");
  expect(await dashboard.title()).not.toContain("127.0.0.1");
  await expect.poll(async () => {
    try { return !!(await dashboardRequest(dashboard, { type: "GET_STATE" })); } catch { return false; }
  }).toBe(true);
  const settings = await dashboardRequest(dashboard, { type: "GET_SETTINGS" });
  expect(settings.llmKey).toBe("");
  expect(settings.groqKeys).toBeUndefined();
  expect(settings.jevKey).toBeUndefined();
  expect(await dashboardRequest(dashboard, { type: "SAVE_SETTINGS", settings: { ...settings, sensitivity: 1.4 } })).toEqual({ ok: true });
  expect((await message({ type: "GET_SETTINGS" })).sensitivity).toBe(1.4);
  // A website may control the session, but cannot forge camera telemetry or pointer samples.
  const denied = await dashboardRequest(dashboard, { type: "SET_STATE", patch: { camera: "Forged" } });
  expect(denied.ok).toBe(false);
  expect(denied.error).toContain("not available");
  expect((await message({ type: "GET_STATE" })).camera).not.toBe("Forged");
  await dashboardRequest(dashboard, { type: "PAUSE" });
  await expect.poll(async () => (await message({ type: "GET_STATE" })).paused).toBe(true);
  await dashboardRequest(dashboard, { type: "RESUME" });
  await expect.poll(async () => (await message({ type: "GET_STATE" })).paused).toBe(false);
  const tabs = await dashboardRequest(dashboard, { type: "GET_TABS" });
  expect(tabs.some((tab: any) => tab.url.includes("/dashboard"))).toBe(false);
  // Closing website controls must preserve the offscreen browser session.
  await dashboard.close();
  expect((await message({ type: "GET_STATE" })).running).toBe(true);
  expect(await offscreenCount()).toBe(1);
});

test("dashboard requests reject after navigating the authorized tab to another path", async () => {
  const opened = context.waitForEvent("page");
  await message({ type: "OPEN_DASHBOARD" });
  const dashboard = await opened;
  dashboard.on("requestfailed",r=>console.log("Dashboard request failed:",r.url(),r.failure()?.errorText));
  await dashboard.waitForURL("http://127.0.0.1:4177/dashboard#overview");
  await dashboard.waitForLoadState("load");
  expect(await dashboard.title()).not.toContain("127.0.0.1");
  await expect.poll(async () => {
    try { return !!(await dashboardRequest(dashboard, { type: "GET_STATE" })); } catch { return false; }
  }).toBe(true);
  // Keep the already-injected isolated-world bridge but change the URL in place.
  // The service worker must revalidate sender.url for every request.
  await dashboard.evaluate(() => history.pushState({}, "", "/unauthorized"));
  const denied = await dashboardRequest(dashboard, { type: "GET_SETTINGS" });
  expect(denied.ok).toBe(false);
  await dashboard.close();
});


test("final transcripts scroll and match named controls without provider dependency", async () => {
  await message({ type: "OFFSCREEN_COMMAND", command: "pause" });
  await message({ type: "TRANSCRIPT", text: "click Count a selection", final: false });
  await expect(page.locator("#clicks")).toHaveText("0");
  await heard("click Count a selection");
  await expect(page.locator("#clicks")).toHaveText("1");
  await heard("scroll down");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  await page.evaluate(() => {
    for (const id of ["careers-one", "careers-two"]) document.getElementById(id)!.addEventListener("click", () => document.body.dataset.selected = id);
  });
  await heard("open Careers contact");
  await expect(page.locator("#handsfree-assist-overlay .choice")).toHaveCount(2);
  expect(await page.evaluate(() => document.body.dataset.selected)).toBeUndefined();
  await heard("choose two");
  expect(await page.evaluate(() => document.body.dataset.selected)).toBeUndefined();
  await heard("click this");
  await expect(page.locator("body")).toHaveAttribute("data-selected", "careers-two");
});

test("background search preserves the query and current tab from a final transcript", async () => {
  await message({ type: "OFFSCREEN_COMMAND", command: "pause" });
  const before = await message({ type: "GET_STATE" });
  await heard("search for accessible design in a new tab in background");
  const results = await worker.evaluate(async () => chrome.tabs.query({ url: "https://www.google.com/search*" }));
  const result = results.find(tab => tab.url === "https://www.google.com/search?q=accessible%20design" || tab.pendingUrl === "https://www.google.com/search?q=accessible%20design");
  expect(result).toBeDefined();
  expect(result!.active).toBe(false);
  expect((await message({ type: "GET_STATE" })).targetTabId).toBe(before.targetTabId);
  await worker.evaluate(async id => { await chrome.tabs.remove(id); }, result!.id!);
});

test("wake answers, find highlights and named clicks use the real worker and content safety gates", async () => {
  await message({ type: "OFFSCREEN_COMMAND", command: "pause" });
  await message({ type: "SAVE_PROVIDERS", groqKeys: ["fixture-groq-key"], jevKey: "" });
  // Stub only the external provider HTTP boundary, never the router or page action.
  await worker.evaluate(() => {
    const scope = globalThis as any;
    scope.fixtureOriginalFetch = scope.fetch;
    scope.fetch = async (url: any, init: any) => {
      if (!String(url).startsWith("https://api.groq.com/")) return scope.fixtureOriginalFetch(url, init);
      const data = JSON.parse(JSON.parse(init.body).messages[1].content);
      scope.fixturePageContext = data.page;
      const phrase = data.phrase as string;
      const output = phrase.startsWith("find")
        ? { ids: [data.targets.find((target: any) => target.text === "Count a selection").id] }
        : phrase.startsWith("click")
          // Live Groq can return find IDs for explicit clicks. Preserve the
          // original request's local matching semantics after validation.
          ? { ids: [data.targets.find((target: any) => target.text === phrase.replace(/^click /, "")).id] }
          : phrase.startsWith("open")
            ? { ids: [], intent: { type: "click-target", query: phrase.replace(/^open /, "") } }
            : { ids: [], answer: "<b>A useful answer</b>" };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
  });
  try {
    await page.locator("#search").fill("INPUT_SECRET");
    await heard("hey handsfree summarize this page");
    await expect(page.locator("#handsfree-assist-overlay .feedback")).toHaveText("<b>A useful answer</b>");
    await expect(page.locator("#handsfree-assist-overlay .feedback b")).toHaveCount(0);
    expect((await message({ type: "GET_STATE" })).feedback).toBe("<b>A useful answer</b>");
    const pageContext = await worker.evaluate(() => (globalThis as any).fixturePageContext);
    expect(pageContext.text).toContain("A controlled page");
    expect(pageContext.text).not.toContain("INPUT_SECRET");
    await heard("hey handsfree find Count a selection");
    await expect(page.locator("#clicks")).toHaveText("0");
    await expect(page.locator("#handsfree-assist-overlay .feedback")).toContainText("Found Count a selection");
    await heard("hey handsfree click Count a selection");
    await expect(page.locator("#clicks")).toHaveText("1");
    await heard("hey handsfree open Submit example form");
    await expect(page.locator("#submissions")).toHaveText("0");
    await expect(page.locator("#handsfree-assist-overlay .feedback")).toContainText("confirm");
    await heard("cancel");
    await heard("confirm");
    await expect(page.locator("#submissions")).toHaveText("0");
    await heard("hey handsfree click Submit example form");
    await heard("confirm");
    await expect(page.locator("#submissions")).toHaveText("1");
    const before = await message({ type: "GET_STATE" });
    const background = context.waitForEvent("page");
    await heard("hey handsfree open the first link in a background tab");
    const opened = await background;
    await opened.waitForURL("**/second");
    expect((await message({ type: "GET_STATE" })).targetTabId).toBe(before.targetTabId);
    expect(await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id)).toBe(before.targetTabId);
  } finally {
    await worker.evaluate(() => {
      const scope = globalThis as any;
      scope.fetch = scope.fixtureOriginalFetch;
      delete scope.fixtureOriginalFetch;
      delete scope.fixturePageContext;
    });
    await message({ type: "SAVE_PROVIDERS", groqKeys: [], jevKey: "" });
  }
});

test("persisted cursor styles render distinct shapes with a visible dwell ring", async () => {
  await point("#count");
  const original = await message({ type: "GET_SETTINGS" });
  try {
    for (const cursorStyle of ["circle", "arrow", "crosshair", "spark"] as const) {
      await message({ type: "SAVE_SETTINGS", settings: { ...original, cursorStyle, sensitivity: 6, dwellMs: 5000, scrollSensitivity: 3 } });
      await expect(page.locator("#handsfree-assist-overlay .cursor")).toHaveAttribute("data-style", cursorStyle);
      await expect(page.locator(`#handsfree-assist-overlay .cursor-icon[data-icon="${cursorStyle}"]`)).toBeVisible();
      await expect(page.locator("#handsfree-assist-overlay .dwell-ring")).toBeVisible();
      expect(await message({ type: "GET_SETTINGS" })).toMatchObject({ cursorStyle, sensitivity: 6, dwellMs: 5000, scrollSensitivity: 3 });
    }
  } finally { await message({ type: "SAVE_SETTINGS", settings: original }); }
});


test("visible aria-hidden YouTube thumbnails retain dwell across the title area", async () => {
  await message({ type: "OFFSCREEN_COMMAND", command: "pause" });
  const original = await message({ type: "GET_SETTINGS" });
  await page.evaluate(() => {
    const card = document.createElement("ytd-video-renderer");
    card.innerHTML = '<a id="video-thumbnail" aria-hidden="true" href="/second" style="display:block;width:300px;height:180px;background:#777"><span>Thumbnail</span></a><a id="video-title" href="/second" style="display:block;width:300px;height:40px">Video title</a>';
    document.body.prepend(card);
    for (const link of card.querySelectorAll("a")) link.addEventListener("click", event => {
      event.preventDefault();
      document.body.dataset.videoClicks = String(Number(document.body.dataset.videoClicks || 0) + 1);
    });
  });
  try {
    await message({ type: "SAVE_SETTINGS", settings: { ...original, dwellEnabled: true, dwellMs: 800 } });
    await point("#video-thumbnail");
    await expect(page.locator("#handsfree-assist-overlay .outline")).toBeVisible();
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(100);
      await point(i === 3 || i > 8 ? "#video-title" : "#video-thumbnail");
    }
    await expect(page.locator("body")).toHaveAttribute("data-video-clicks", "1");
    expect(await page.evaluate(() => location.pathname)).toBe("/");
  } finally { await message({ type: "SAVE_SETTINGS", settings: original }); }
});

test("final transcripts navigate generic result links and focus fields without pointer samples", async () => {
  await message({ type: "OFFSCREEN_COMMAND", command: "pause" });
  const originalPage = page;
  const opened: Page[] = [];
  // Replace only the search network response with a localhost fixture redirect.
  const searchPattern = "https://www.google.com/search?**";
  await context.route(searchPattern, route => route.fulfill({ status: 302, headers: { location: "http://127.0.0.1:4177/results?q=accessible%20design" } }));
  try {
    const searchOpened = context.waitForEvent("page");
    await heard("search for accessible design");
    page = await searchOpened; opened.push(page);
    await page.waitForURL("**/results?q=accessible%20design");
    await expect(page.locator("#handsfree-assist-overlay")).toBeAttached();
    await heard("click the first link");
    await page.waitForURL("**/second");
    await expect(page.locator("#handsfree-assist-overlay")).toBeAttached();
    await heard("previous page");
    await page.waitForURL("**/results?q=accessible%20design");
    await expect(page.locator("#handsfree-assist-overlay")).toBeAttached();
    await heard("click the ChatGPT link");
    await page.waitForURL("**/second");
    await expect(page.locator("#handsfree-assist-overlay")).toBeAttached();
    await heard("go back");
    await page.waitForURL("**/results?q=accessible%20design");
    await expect(page.locator("#handsfree-assist-overlay")).toBeAttached();
    await heard("click the second result");
    await page.waitForURL("**/guide");
    await expect(page.locator("#handsfree-assist-overlay")).toBeAttached();
    await heard("go back");
    await page.waitForURL("**/results?q=accessible%20design");
    await expect(page.locator("#handsfree-assist-overlay")).toBeAttached();
    const before = await message({ type: "GET_STATE" });
    const foregroundOpened = context.waitForEvent("page");
    await heard("open the first link in a new tab");
    const foreground = await foregroundOpened; opened.push(foreground);
    await foreground.waitForURL("**/second");
    await expect.poll(async () => (await message({ type: "GET_STATE" })).targetTabId).not.toBe(before.targetTabId);
    await heard("go to tab generic fixture results");
    await expect.poll(async () => (await message({ type: "GET_STATE" })).targetTabId).toBe(before.targetTabId);
    const backgroundOpened = context.waitForEvent("page");
    await heard("open the second result in a background tab");
    const background = await backgroundOpened; opened.push(background);
    await background.waitForURL("**/guide");
    expect((await message({ type: "GET_STATE" })).targetTabId).toBe(before.targetTabId);
    const active = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
    expect(active).toBe(before.targetTabId);
    await heard("focus the search box");
    await expect(page.locator("#result-search")).toBeFocused();
    await expect(page.locator("#result-search")).toHaveValue("");
    await heard("show links");
    await expect(page.locator("#handsfree-assist-overlay .choice")).toHaveCount(2);
    await heard("choose two");
    expect(new URL(page.url()).pathname).toBe("/results");
    await heard("click this");
    await page.waitForURL("**/guide");
    await heard("go back");
    await page.waitForURL("**/results?q=accessible%20design");
    await page.evaluate(() => {
      const duplicate = document.createElement("a");
      duplicate.href = "/guide";
      duplicate.textContent = "ChatGPT";
      document.querySelector("main")!.append(duplicate);
    });
    const beforeAmbiguous = await message({ type: "GET_STATE" });
    await heard("open the ChatGPT link in a background tab");
    await expect(page.locator("#handsfree-assist-overlay .choice")).toHaveCount(2);
    await heard("choose two");
    const ambiguousBackground = context.waitForEvent("page");
    await heard("click this");
    const selectedBackground = await ambiguousBackground; opened.push(selectedBackground);
    await selectedBackground.waitForURL("**/guide");
    expect((await message({ type: "GET_STATE" })).targetTabId).toBe(beforeAmbiguous.targetTabId);
    expect(await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id)).toBe(beforeAmbiguous.targetTabId);
  } finally {
    await context.unroute(searchPattern);
    page = originalPage;
    for (const tab of opened.reverse()) if (!tab.isClosed()) await tab.close();
  }
});

test("final transcripts activate real multiline fragments and reject changed base destinations", async () => {
  await message({ type: "OFFSCREEN_COMMAND", command: "pause" });
  const geometry = await page.evaluate(() => {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "width:140px;font:16px/40px sans-serif";
    wrapper.innerHTML = '<a id="wrapping-voice-link" href="/second" style="display:inline;margin:0">Wrapping inline navigation link</a>';
    document.body.prepend(wrapper);
    const link = wrapper.querySelector("a")!;
    link.addEventListener("click", event => { event.preventDefault(); document.body.dataset.fragmentClicks = String(Number(document.body.dataset.fragmentClicks || 0) + 1); });
    const box = link.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { fragments: link.getClientRects().length, unionCenterExposed: hit === link || !!hit && link.contains(hit) };
  });
  expect(geometry.fragments).toBe(2);
  expect(geometry.unionCenterExposed).toBe(false);
  await heard("click Wrapping inline navigation link");
  await expect(page.locator("body")).toHaveAttribute("data-fragment-clicks", "1");
  await page.evaluate(() => {
    const cover = document.createElement("div"); cover.id = "fragment-cover";
    cover.style.cssText = "position:fixed;inset:0;z-index:999999;background:white"; document.body.append(cover);
  });
  await heard("click Wrapping inline navigation link");
  await expect(page.locator("body")).toHaveAttribute("data-fragment-clicks", "1");
  await page.evaluate(() => {
    document.getElementById("fragment-cover")!.remove(); document.getElementById("wrapping-voice-link")!.remove();
    const base = document.createElement("base"); base.href = "http://127.0.0.1:4177/original/"; document.head.append(base);
    const main = document.createElement("main"); main.innerHTML = '<h2><a id="relative-voice-link" href="destination">Relative destination</a></h2>'; document.body.prepend(main);
    main.querySelector("a")!.addEventListener("click", event => { event.preventDefault(); document.body.dataset.relativeActivated = "true"; });
  });
  await heard("show links"); await heard("choose one");
  await page.evaluate(() => { document.querySelector("base")!.href = "http://127.0.0.1:4177/replacement/"; });
  await heard("click this");
  expect(await page.locator("body").getAttribute("data-relative-activated")).toBeNull();
  await expect(page.locator("#handsfree-assist-overlay .feedback")).toContainText("changed");
});
