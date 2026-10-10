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
let context: BrowserContext,
  worker: Worker,
  controls: Page,
  page: Page,
  staging: string;
const urls: Record<string, string> = {
  wikipedia: "https://en.wikipedia.org/wiki/India",
  github: "https://github.com/demo/handsfree",
  reddit: "https://www.reddit.com/r/demo/",
  amazon: "https://www.amazon.in/dp/B000TEST",
  spotify: "https://open.spotify.com/search/demo",
  netflix: "https://www.netflix.com/browse",
  x: "https://x.com/home",
};
const message = (msg: any) =>
  controls.evaluate((msg) => chrome.runtime.sendMessage(msg), msg);
const heard = (text: string) => message({ type: "HEARD", text });
async function open(site: string) {
  await page.goto(urls[site]);
  const id = await worker.evaluate(
    async (url) => (await chrome.tabs.query({ url }))[0].id,
    urls[site],
  );
  await message({ type: "START", tabId: id });
  await expect(page.locator("#handsfree-assist-overlay")).toBeAttached();
}
test.beforeAll(async () => {
  staging = await mkdtemp(path.join(os.tmpdir(), "handsfree-sites-"));
  const dist = path.join(staging, "extension");
  await cp(path.resolve("dist"), dist, { recursive: true });
  const manifest = JSON.parse(
    await readFile(path.join(dist, "manifest.json"), "utf8"),
  );
  manifest.permissions.push("tabs");
  manifest.host_permissions = ["https://*/*", "http://127.0.0.1/*"];
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
  // All site requests are fulfilled locally. No account or public site receives writes.
  for (const [site, url] of Object.entries(urls)) {
    const host = new URL(url).hostname;
    await context.route(`https://${host}/**`, async (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: await readFile(
          path.join("tests/fixtures", "site-" + site + ".html"),
          "utf8",
        ),
      }),
    );
  }
  worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  controls = await context.newPage();
  await controls.goto(
    `chrome-extension://${worker.url().split("/")[2]}/popup.html`,
  );
  await message({ type: "SAVE_PROVIDERS", groqKeys: [], jevKey: "" });
  const settings = await message({ type: "GET_SETTINGS" });
  await message({
    type: "SAVE_SETTINGS",
    settings: {
      ...settings,
      voiceOnly: true,
      testWriteTargets: ["https://github.com/demo/handsfree"],
      dwellEnabled: false,
      edgeScroll: false,
      spokenFeedback: false,
    },
  });
  page = await context.newPage();
});
test.afterAll(async () => {
  await context?.close();
  if (staging) await rm(staging, { recursive: true, force: true });
});
for (const site of Object.keys(urls)) {
  test(`${site} announces grounded capabilities without a camera`, async () => {
    await open(site);
    await heard("what can I do here?");
    const state = await message({ type: "GET_STATE" });
    expect(state.feedback).toContain(site);
    expect(state.confidence).toBe(0);
    const contexts = await worker.evaluate(() =>
      chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      }),
    );
    const offscreen = context
      .pages()
      .find((p) => p.url().endsWith("/offscreen.html"));
    expect(contexts.length).toBe(1);
    expect(await controls.locator("video").count()).toBe(0);
    expect(state.camera).toMatch(/voice.only|Off/i);
  });
  test(`${site} performs a scoped read action from a final transcript`, async () => {
    await open(site);
    const commands: Record<string, string> = {
      wikipedia: "take me to Geography section",
      github: "open the src folder",
      reddit: "search Reddit for keyboards",
      amazon: "show customer reviews",
      spotify: "search Spotify for Radiohead",
      netflix: "search Netflix for demo",
      x: "search X for accessibility",
    };
    await heard(commands[site]);
    if (site === "wikipedia") {
      expect((await message({ type: "GET_STATE" })).feedback).toContain(
        "At Geography",
      );
      await expect(page.locator("#Geography")).toBeInViewport();
    } else if (site === "amazon") {
      expect((await message({ type: "GET_STATE" })).feedback).toContain(
        "At Reviews",
      );
      await expect(page.locator("#customerReviews")).toBeInViewport();
    } else
      await expect(page).toHaveURL(({ pathname, search }) =>
        site === "github"
          ? pathname.includes("/tree/main/src")
          : site === "spotify"
            ? pathname.includes("Radiohead".toLowerCase())
            : search.length > 0,
      );
  });
  test(`${site} cancels a preview or explains an unavailable mutation`, async () => {
    await open(site);
    const phrases: Record<string, string> = {
      wikipedia: "checkout",
      github: "star this repository",
      reddit: "like this post",
      amazon: "add one of these to my cart",
      spotify: "like this song",
      netflix: "like this video",
      x: "like this post",
    };
    await heard(phrases[site]);
    await heard("cancel");
    expect(await page.locator("button[data-clicks]").count()).toBe(0);
    expect((await message({ type: "GET_STATE" })).feedback).toContain(
      "Cancelled",
    );
  });
}
test("GitHub named field, literal dictation, cancelled and confirmed custom publication", async () => {
  await open("github");
  await heard("write the issue title");
  expect((await message({ type: "GET_STATE" })).dictating).toBe(true);
  await heard("scroll down send like this cancel");
  await expect(page.locator("input")).toHaveValue(
    "scroll down send like this cancel",
  );
  await heard("literal finish dictation");
  await expect(page.locator("input")).toHaveValue(
    "scroll down send like this cancel finish dictation",
  );
  await heard("finish dictation");
  expect((await message({ type: "GET_STATE" })).dictating).toBe(false);
  await heard("submit this issue");
  await heard("cancel");
  await expect(page.locator('[data-testid="issue-title"]')).toHaveCount(0);
  await heard("submit this issue");
  await heard("confirm");
  await expect(page.locator('[data-testid="issue-title"]')).toHaveCount(1);
  await heard("confirm");
  await expect(page.locator('[data-testid="issue-title"]')).toHaveCount(1);
});
test("X numbered choice, desired-state confirmation and repeated like", async () => {
  await open("x");
  await heard("list results");
  expect((await message({ type: "GET_STATE" })).feedback).toContain(
    "2. Second test post",
  );
  await heard("the second one");
  await expect(page).toHaveURL(/status\/222/);
  // A detail route has one post, as the actual site does.
  await page
    .locator("article")
    .first()
    .evaluate((e) => e.remove());
  await heard("like this post");
  await heard("confirm");
  await expect(page.locator("button")).toHaveAttribute("data-clicks", "1");
  await heard("like this post");
  await expect(page.locator("button")).toHaveAttribute("data-clicks", "1");
});
test("old confirmation cannot activate a rerendered button and generic click cannot bypass guard", async () => {
  await open("github");
  await heard("star this repository");
  await page.locator('button[aria-label="Star"]').evaluate((e) => {
    e.outerHTML = e.outerHTML;
  });
  await heard("confirm");
  expect(await page.locator("button[data-clicks]").count()).toBe(0);
  await heard("open Star");
  await heard("click");
  expect(await page.locator("button[data-clicks]").count()).toBe(0);
});

test("Spotify and Netflix plain pause controls media, with verified seek, volume and mute", async () => {
  const rate = 8000,
    size = rate * 15 * 2,
    wav = Buffer.alloc(44 + size);
  wav.write("RIFF");
  wav.writeUInt32LE(36 + size, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(size, 40);
  await context.route("**/tone.wav", (r) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(
      r.request().headers()["range"] || "",
    );
    const start = range ? Number(range[1]) : 0,
      end =
        range && range[2]
          ? Math.min(wav.length - 1, Number(range[2]))
          : wav.length - 1;
    return r.fulfill({
      status: range ? 206 : 200,
      contentType: "audio/wav",
      headers: {
        "Accept-Ranges": "bytes",
        ...(range
          ? { "Content-Range": `bytes ${start}-${end}/${wav.length}` }
          : {}),
      },
      body: wav.subarray(start, end + 1),
    });
  });
  for (const site of ["spotify", "netflix"]) {
    await open(site);
    await page.evaluate(() => {
      const video = document.createElement("video");
      video.id = "site-player";
      video.src = "/tone.wav";
      video.controls = true;
      video.muted = true;
      video.width = 640;
      video.height = 360;
      document.body.append(video);
    });
    const player = page.locator("#site-player");
    await expect
      .poll(() => player.evaluate((p: HTMLVideoElement) => p.duration))
      .toBe(15);
    await heard(site === "spotify" ? "resume the music" : "resume the episode");
    await expect
      .poll(() => player.evaluate((p: HTMLVideoElement) => p.paused))
      .toBe(false);
    await heard("pause");
    await expect
      .poll(() => player.evaluate((p: HTMLVideoElement) => p.paused))
      .toBe(true);
    expect((await message({ type: "GET_STATE" })).paused).toBe(false);
    await heard("go to five seconds");
    await expect
      .poll(() => player.evaluate((p: HTMLVideoElement) => p.currentTime))
      .toBe(5);
    await heard("go forward three seconds");
    await expect
      .poll(() => player.evaluate((p: HTMLVideoElement) => p.currentTime))
      .toBe(8);
    await heard("set player volume to forty percent");
    await expect
      .poll(() => player.evaluate((p: HTMLVideoElement) => p.volume))
      .toBe(0.4);
    await heard(site === "spotify" ? "unmute the player" : "unmute this video");
    await expect
      .poll(() => player.evaluate((p: HTMLVideoElement) => p.muted))
      .toBe(false);
  }
});
test("bounded plans stop at a confirmation and cancellation leaves the fixture unchanged", async () => {
  await open("github");
  await heard("open the src folder then star this repository");
  await expect(page).toHaveURL(/tree\/main\/src/);
  expect((await message({ type: "GET_STATE" })).feedback).toContain(
    "Say confirm",
  );
  expect(await page.locator("button[data-clicks]").count()).toBe(0);
  await heard("cancel");
  expect(await page.locator("button[data-clicks]").count()).toBe(0);
});

test("explicit new-tab commands outrank broad site open rules",async()=>{
 await open('github');const count=context.pages().length;await heard('open a fresh tab');await expect.poll(()=>context.pages().length).toBe(count+1);
 const created=context.pages().find(p=>p!==page&&p!==controls&&p.url()==='about:blank');expect(created).toBeTruthy();await created!.close();
});
