import { test, expect, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let context: BrowserContext, worker: Worker, controls: Page, start: Page, staging: string;
const message = (msg: any) => controls.evaluate(msg => chrome.runtime.sendMessage(msg), msg);
const heard = (text: string) => message({ type: "HEARD", text });
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const nextSitePage = (host: string) => context.waitForEvent("page", { predicate: async page => {
  try { await page.waitForURL(url => url.hostname === host, { timeout: 5000 }); return true; } catch { return false; }
} });
const shell = (body: string) => `<!doctype html><meta charset="utf-8"><style>body{font:20px system-ui;padding:20px}button{font:inherit;padding:15px}ytd-video-renderer{display:block;width:500px;height:180px}video{width:640px;height:360px}</style>${body}`;
function audioFixture() {
  const dataLength = 8000 * 2 * 60, wav = Buffer.alloc(44 + dataLength);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + dataLength, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(dataLength, 40);
  return wav;
}

test.beforeAll(async () => {
  staging = await mkdtemp(path.join(os.tmpdir(), "handsfree-routines-"));
  const dist = path.join(staging, "extension");
  await cp(path.resolve("dist"), dist, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(dist, "manifest.json"), "utf8"));
  manifest.permissions.push("tabs");
  manifest.host_permissions = ["https://*/*", "http://127.0.0.1/*"];
  await writeFile(path.join(dist, "manifest.json"), JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(path.join(staging, "profile"), {
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  await context.route(/^https:\/\/www\.youtube\.com(?:\/|$)/, async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/media.wav") {
      await delay(350);
      const wav = audioFixture(), range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers()["range"] || "");
      const begin = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(wav.length - 1, Number(range[2])) : wav.length - 1;
      return route.fulfill({ status: range ? 206 : 200, contentType: "audio/wav", headers: { "Accept-Ranges": "bytes", ...(range ? { "Content-Range": `bytes ${begin}-${end}/${wav.length}` } : {}) }, body: wav.subarray(begin, end + 1) });
    }
    const body = url.pathname === "/results"
      ? `<main id="results"></main><script>setTimeout(()=>document.querySelector('main').innerHTML='<ytd-video-renderer><a id="video-title" href="/watch?v=lesson">Physics lesson</a></ytd-video-renderer>',500)</script>`
      : url.pathname === "/watch"
        ? `<main><ytd-watch-metadata><h1>Physics lesson</h1></ytd-watch-metadata><div id="movie_player"></div></main><script>setTimeout(()=>{const v=document.createElement('video');v.className='html5-main-video';v.muted=true;v.preload='auto';v.src='/media.wav';document.querySelector('#movie_player').append(v)},500)</script>`
        : "<main><h1>YouTube fixture</h1></main>";
    return route.fulfill({ contentType: "text/html", body: shell(body) });
  });
  await context.route(/^https:\/\/open\.spotify\.com(?:\/|$)/, route => route.fulfill({ contentType: "text/html", body: shell(`<main><h1>Spotify fixture</h1></main><div id="player"></div><script>setTimeout(()=>{const b=document.createElement('button');b.dataset.testid='control-button-playpause';b.setAttribute('aria-label','Play');b.textContent='Play';b.onclick=()=>{b.setAttribute('aria-label','Pause');b.textContent='Pause';b.dataset.clicks=String(Number(b.dataset.clicks||0)+1)};document.querySelector('#player').append(b)},650)</script>`) }));
  await context.route("https://www.google.com/**", route => route.fulfill({ contentType: "text/html", body: shell("<main>Physics notes search results</main>") }));
  const whatsapp = (await readFile(path.resolve("tests/fixtures/site-whatsapp.html"), "utf8"))
    .replace('data-chat-id="owned-chat"', 'data-chat-id="sam-id"')
    .replace('<span title="Mira">Mira</span>', '<span title="Sam">Sam</span>')
    .replace("document.querySelector('#main header span').textContent=row.textContent;", "setTimeout(()=>{document.querySelector('#main header span').textContent=row.textContent;document.querySelector('#main header span').title=row.textContent;document.querySelector('#main').dataset.chatId=row.textContent==='Mira'?'mira-id':'sam-id'},350);");
  await context.route("https://web.whatsapp.com/**", route => route.fulfill({ contentType: "text/html", body: whatsapp }));
  worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  controls = await context.newPage();
  await controls.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  await message({ type: "SAVE_PROVIDERS", groqKeys: [], jevKey: "" });
  await message({ type: "SAVE_SETTINGS", settings: { ...await message({ type: "GET_SETTINGS" }), voiceOnly: true, dwellEnabled: false, spokenFeedback: false } });
  start = await context.newPage();
});
test.beforeEach(async () => {
  await message({ type: "STOP" });
  await start.goto("http://127.0.0.1:4177/");
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1:4177/" }))[0].id);
  await message({ type: "START", tabId });
});
test.afterAll(async () => { await context?.close(); if (staging) await rm(staging, { recursive: true, force: true }); });
test.afterEach(async ({}, info) => {
  if (info.status === info.expectedStatus) return;
  await info.attach("routine-diagnostics", { contentType: "application/json", body: JSON.stringify({ state: await message({ type: "GET_STATE" }), routine: await message({ type: "GET_ROUTINE_SESSION" }), pages: context.pages().map(page => page.url()) }) });
});

test("records, saves and replays a YouTube routine across delayed results and real media metadata", async () => {
  await heard("start recording routine");
  const recordedPage = nextSitePage("www.youtube.com");
  await heard("open YouTube");
  const page = await recordedPage;
  await page.waitForURL("https://www.youtube.com/");
  await expect(page.locator("#handsfree-assist-overlay")).toBeAttached();
  await heard("search YouTube for physics lessons");
  await page.waitForURL(/\/results\?/);
  await expect(page.locator("ytd-video-renderer")).toBeVisible();
  await expect(page.locator("#handsfree-assist-overlay")).toBeAttached();
  await heard("open the first video");
  await page.waitForURL(/\/watch\?v=lesson/);
  await expect.poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState).catch(() => 0)).toBeGreaterThanOrEqual(1);
  await expect(page.locator("#handsfree-assist-overlay")).toBeAttached();
  for (const [command, id] of [["set player volume to forty percent", "YT07"], ["set playback speed to 1.5", "YT09"], ["skip forward ten seconds", "YT06"], ["play the video", "YT11"], ["pause the video", "YT05"]]) {
    await heard(command);
    expect((await message({ type: "GET_ROUTINE_SESSION" })).draft.at(-1).action.action, (await message({ type: "GET_STATE" })).feedback).toBe(id);
  }
  await heard("stop recording routine");
  const draft = await message({ type: "GET_ROUTINE_SESSION" });
  expect(draft.draft.map((step: any) => step.action.action || step.action.type)).toEqual(["open-site", "YT01", "YT03", "YT07", "YT09", "YT06", "YT11", "YT05"]);
  expect(await message({ type: "SAVE_ROUTINE", name: "Study session", steps: draft.draft })).toHaveProperty("id");

  const replayPage = nextSitePage("www.youtube.com");
  await heard("run Study session");
  const replay = await replayPage;
  await expect.poll(async () => (await message({ type: "GET_ROUTINE_SESSION" })).feedback, { timeout: 15000 }).toBe("Finished routine Study session.");
  expect(replay.url()).toBe("https://www.youtube.com/watch?v=lesson");
  const media = await replay.locator("video").evaluate((v: HTMLVideoElement) => ({ volume: v.volume, speed: v.playbackRate, time: v.currentTime, paused: v.paused }));
  expect(media).toMatchObject({ volume: 0.4, speed: 1.5, paused: true });
  expect(media.time).toBeGreaterThanOrEqual(10);
});

test("Spotify waits for its delayed UI control, plays once and continues with the background search", async () => {
  await heard("start recording routine");
  const recordedPage = nextSitePage("open.spotify.com");
  await heard("open Spotify");
  const page = await recordedPage;
  // Chromium can issue the first tabs.create navigation before Playwright
  // attaches request interception. Reload the same URL into the local fixture.
  await page.goto("https://open.spotify.com/");
  await expect(page.locator('[data-testid="control-button-playpause"]')).toBeVisible();
  await expect(page.locator("#handsfree-assist-overlay")).toBeAttached();
  await heard("continue playing");
  await expect(page.locator('[data-testid="control-button-playpause"]')).toHaveAttribute("aria-label", "Pause");
  await heard("background search for physics notes");
  await heard("stop recording routine");
  const draft = await message({ type: "GET_ROUTINE_SESSION" });
  expect(draft.draft.map((step: any) => step.action.type)).toEqual(["open-site", "media", "search"]);
  expect(await message({ type: "SAVE_ROUTINE", name: "Music and notes", steps: draft.draft })).toHaveProperty("id");
  // Observe newly created tabs directly: a cold navigation can bypass the
  // fixture route and Google can redirect its URL after creation.
  await worker.evaluate(() => {
    const scope = globalThis as any;
    scope.routineCreatedTabs = [];
    scope.routineTabListener = (tab: chrome.tabs.Tab) => scope.routineCreatedTabs.push({ id: tab.id, active: tab.active, url: tab.pendingUrl || tab.url });
    chrome.tabs.onCreated.addListener(scope.routineTabListener);
  });

  const replayPage = nextSitePage("open.spotify.com");
  await heard("run Music and notes");
  const replay = await replayPage;
  await replay.goto("https://open.spotify.com/");
  await expect.poll(async () => (await message({ type: "GET_ROUTINE_SESSION" })).feedback, { timeout: 15000 }).toBe("Finished routine Music and notes.");
  await expect(replay.locator('[data-testid="control-button-playpause"]')).toHaveAttribute("aria-label", "Pause");
  await expect(replay.locator('[data-testid="control-button-playpause"]')).toHaveAttribute("data-clicks", "1");
  const created = await worker.evaluate(() => {
    const scope = globalThis as any;
    chrome.tabs.onCreated.removeListener(scope.routineTabListener);
    return scope.routineCreatedTabs as { id: number; active: boolean; url?: string }[];
  });
  const searches = created.filter(tab => tab.url?.startsWith("https://www.google.com/search?"));
  expect(searches).toHaveLength(1);
  expect(new URL(searches[0].url!).searchParams.get("q")).toBe("physics notes");
  expect(searches[0].active).toBe(false);
});

test("records a WhatsApp message without sending during setup, then sends once automatically to the saved chat", async () => {
  await heard("start recording routine");
  const recordedPage = nextSitePage("web.whatsapp.com");
  await heard("open WhatsApp");
  const page = await recordedPage;
  await page.goto("https://web.whatsapp.com/");
  await expect(page.locator("#handsfree-assist-overlay")).toBeAttached();
  await heard("open my chat with Mira");
  await expect(page.locator("#main")).toHaveAttribute("data-chat-id", "mira-id");
  await heard("write a message");
  await heard("I arrived safely. See you soon!");
  await heard("stop typing");
  await heard("send this message");
  await expect(page.locator(".message-out")).toHaveCount(0);
  await heard("stop recording routine");
  const draft = await message({ type: "GET_ROUTINE_SESSION" });
  expect(draft.draft.map((step: any) => step.action.action || step.action.type)).toEqual(["open-site", "WA01", "whatsapp-message"]);
  expect(draft.draft.at(-1).action).toEqual({ type: "whatsapp-message", recipient: { identity: "mira-id", label: "Mira" }, text: "I arrived safely. See you soon!" });
  expect(await message({ type: "SAVE_ROUTINE", name: "Arrived", steps: draft.draft })).toHaveProperty("id");
  const replayPage = nextSitePage("web.whatsapp.com");
  await heard("run Arrived");
  const replay = await replayPage;
  await replay.goto("https://web.whatsapp.com/");
  await expect.poll(async () => (await message({ type: "GET_ROUTINE_SESSION" })).feedback, { timeout: 15000 }).toBe("Finished routine Arrived.");
  await expect(replay.locator("#main")).toHaveAttribute("data-chat-id", "mira-id");
  await expect(replay.locator(".message-out")).toHaveCount(1);
  await expect(replay.locator(".message-out")).toHaveText("I arrived safely. See you soon!");
  await expect(replay.locator("footer textarea")).toHaveValue("");
  // Even if the user removes the earlier open-chat step in the dashboard,
  // a saved message must reopen and verify its bound recipient on its own.
  expect(await message({ type: "SAVE_ROUTINE", name: "Direct arrival", steps: [draft.draft.at(-1)] })).toHaveProperty("id");
  await replay.locator('#pane-side [role="row"]').filter({ hasText: "Sam" }).click();
  await expect(replay.locator("#main")).toHaveAttribute("data-chat-id", "sam-id");
  await heard("run Direct arrival");
  await expect.poll(async () => (await message({ type: "GET_ROUTINE_SESSION" })).feedback, { timeout: 15000 }).toBe("Finished routine Direct arrival.");
  await expect(replay.locator("#main")).toHaveAttribute("data-chat-id", "mira-id");
  await expect(replay.locator(".message-out")).toHaveCount(2);
  await replay.locator("footer textarea").fill("Keep my unsent draft");
  await heard("run Direct arrival");
  await expect.poll(async () => (await message({ type: "GET_ROUTINE_SESSION" })).playbackPaused).toBe(true);
  await expect(replay.locator(".message-out")).toHaveCount(2);
  await expect(replay.locator("footer textarea")).toHaveValue("Keep my unsent draft");
  await heard("stop routine");
});
