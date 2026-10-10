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
  whatsapp: "https://web.whatsapp.com/",
  gmail: "https://mail.google.com/mail/u/0/",
  meet: "https://meet.google.com/abc-defg-hij",
  linkedin: "https://www.linkedin.com/jobs/view/123/",
  irctc: "https://www.irctc.co.in/nget/train-search",
  maps: "https://www.google.com/maps/place/Palace",
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
      testWriteTargets: [],
      testMessageRecipients: [
        "whatsapp:mira",
        "gmail:owned@example.test",
        "meet:abc-defg-hij",
      ],
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
  test(`${site}: packaged voice-only context and read workflow`, async () => {
    await open(site);
    await heard("what can I do here?");
    expect((await message({ type: "GET_STATE" })).feedback).toContain(site);
    const commands: Record<string, string> = {
      whatsapp: "read the latest message",
      gmail: "search Gmail for project update",
      meet: "mute my meeting microphone",
      linkedin: "read job details",
      irctc: "travel on 18 November 2026",
      maps: "read the address",
    };
    await heard(commands[site]);
    if (site === "gmail")
      await expect(page).toHaveURL(/#search\/project%20update/);
    else
      expect((await message({ type: "GET_STATE" })).feedback).toMatch(
        (
          {
            whatsapp: /Latest message/,
            meet: /Verified.*Meet/,
            linkedin: /Owned test job details/,
            irctc: /full journey date/,
            maps: /Vasanth Nagar/,
          } as Record<string, RegExp>
        )[site],
      );
    expect((await message({ type: "GET_STATE" })).camera).toMatch(
      /voice.only|Off/i,
    );
  });
}
for (const site of ["whatsapp", "gmail", "meet"]) {
  test(`${site}: literal draft, cancel, one-use confirmed send`, async () => {
    await open(site);
    const write: Record<string, string> = {
      whatsapp: "write a message",
      gmail: "write the body",
      meet: "write a chat message",
    };
    const send: Record<string, string> = {
      whatsapp: "send this message",
      gmail: "send this email",
      meet: "send this to the meeting",
    };
    await heard(write[site]);
    expect((await message({ type: "GET_STATE" })).dictating).toBe(true);
    await heard("scroll down send cancel like this");
    await heard("finish dictation");
    expect((await message({ type: "GET_STATE" })).dictating).toBe(false);
    await heard(send[site]);
    expect((await message({ type: "GET_STATE" })).feedback).toContain(
      "Say confirm",
    );
    await heard("cancel");
    expect(await page.evaluate(() => (window as any).writes)).toBe(0);
    await heard(send[site]);
    await heard("confirm");
    expect((await message({ type: "GET_STATE" })).feedback).toMatch(
      /Exactly one outgoing|Message sent/,
    );
    expect(await page.evaluate(() => (window as any).writes)).toBe(1);
    await heard("confirm");
    expect(await page.evaluate(() => (window as any).writes)).toBe(1);
  });
}
test("WhatsApp wrong-chat confirmation and generic Send are blocked", async () => {
  await open("whatsapp");
  await heard("write a message");
  await heard("Owned test draft");
  await heard("finish dictation");
  await heard("send this message");
  await page
    .locator("#main header span")
    .evaluate((e) => (e.textContent = "Sam"));
  await heard("confirm");
  expect(await page.evaluate(() => (window as any).writes)).toBe(0);
  await heard("click Send");
  await heard("confirm");
  expect(await page.evaluate(() => (window as any).writes)).toBe(0);
});
test("LinkedIn desired save state and stale job confirmation", async () => {
  await open("linkedin");
  await heard("save this job");
  await heard("confirm");
  await expect(page.locator('button[aria-label="Saved"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await heard("save this job");
  expect((await message({ type: "GET_STATE" })).feedback).toContain("already");
  await heard("unsave this job");
  await page
    .locator("h1")
    .evaluate((e) => (e.textContent = "Different company"));
  await heard("confirm");
  await expect(page.locator('button[aria-label="Saved"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
test("IRCTC confirmed search verifies station pair and keeps booking blocked", async () => {
  await open("irctc");
  await heard("search trains");
  expect((await message({ type: "GET_STATE" })).feedback).toMatch(/MAS.*SBC/);
  await heard("confirm");
  await expect(page.locator("[data-train-number]")).toHaveCount(1);
  await heard("book this ticket");
  expect((await message({ type: "GET_STATE" })).feedback).toContain("excluded");
  await expect(page.locator("[data-train-number]")).toHaveCount(1);
});
test("Maps route mode, map zoom and confirmed endpoint navigation", async () => {
  await open("maps");
  await heard("switch to walking");
  await expect(page.locator('[role="radio"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await heard("zoom the map in");
  await expect(page.locator("[data-map-zoom]")).toHaveAttribute(
    "data-map-zoom",
    "11",
  );
  await heard("get directions from Bengaluru Palace to Bengaluru airport");
  expect((await message({ type: "GET_STATE" })).feedback).toContain(
    "Say confirm",
  );
  await heard("confirm");
  await expect(page).toHaveURL(
    /origin=bengaluru\+palace.*destination=bengaluru\+airport/,
  );
});
