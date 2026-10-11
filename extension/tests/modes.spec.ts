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
async function message(message: any) {
  return controls.evaluate(
    (message) => chrome.runtime.sendMessage(message),
    message,
  );
}
async function heard(text: string) {
  await message({ type: "HEARD", text });
}
test.beforeAll(async () => {
  staging = await mkdtemp(path.join(os.tmpdir(), "handsfree-modes-"));
  const dist = path.join(staging, "extension");
  await cp(path.resolve("dist"), dist, { recursive: true });
  const manifest = JSON.parse(
    await readFile(path.join(dist, "manifest.json"), "utf8"),
  );
  manifest.permissions.push("tabs");
  manifest.host_permissions = ["http://127.0.0.1/*", "https://api.groq.com/*"];
  await writeFile(path.join(dist, "manifest.json"), JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(
    path.join(staging, "profile"),
    {
      executablePath: "/usr/bin/chromium",
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
  controls = await context.newPage();
  await controls.goto(
    `chrome-extension://${worker.url().split("/")[2]}/popup.html`,
  );
  page = await context.newPage();
  await page.goto("http://127.0.0.1:4177");
  await message({ type: "SAVE_PROVIDERS", groqKeys: [], jevKey: "" });
  const tabs = await worker.evaluate(() =>
    chrome.tabs.query({ url: "http://127.0.0.1:4177/*" }),
  );
  await message({ type: "START", tabId: tabs[0].id });
  await message({ type: "OFFSCREEN_COMMAND", command: "pause" });
});
test.afterAll(async () => {
  await context?.close();
  await rm(staging, { recursive: true, force: true });
});
test("packaged reading modes select exact words, sentences and head-pointer range without navigation", async () => {
  await page.evaluate(() => {
    document.body.innerHTML =
      '<main><h1>Reading fixture</h1><p id="paragraph">The difficult alpha-2 receptor matters. This sentence has five final words.</p><p>Another passage with a link <a href="/other">reference</a> and more text.</p></main>';
  });
  await heard("reading mode");
  await expect(
    controls.getByText("Current mode:", { exact: false }),
  ).toContainText("Reading");
  await heard("number the words");
  await expect(page.locator("#handsfree-reading-lens")).toContainText(
    "3. alpha-2",
  );
  await heard("highlight words three to five");
  expect(await page.evaluate(() => getSelection()?.toString())).toBe(
    "alpha-2 receptor matters.",
  );
  await heard("highlight the last three words of sentence two");
  expect(await page.evaluate(() => getSelection()?.toString())).toBe(
    "five final words.",
  );
  await heard("magnify this paragraph");
  await expect(page.locator("#handsfree-reading-lens")).toBeVisible();
  await heard("zoom this page to 150 percent");
  expect(
    await worker.evaluate(
      (tab) => chrome.tabs.getZoom(tab),
      (await message({ type: "GET_STATE" })).targetTabId,
    ),
  ).toBeCloseTo(1.5);
  await heard("restore previous page zoom");
  expect(
    await worker.evaluate(
      (tab) => chrome.tabs.getZoom(tab),
      (await message({ type: "GET_STATE" })).targetTabId,
    ),
  ).toBeCloseTo(1);
  await heard("open a simplified reading view");
  await expect(page.locator("#handsfree-reading-view")).toContainText(
    "alpha-2 receptor",
  );
  await heard("close the reading view");
  await controls.screenshot({
    path: "test-results/mode-popup.png",
    clip: { x: 0, y: 0, width: 360, height: 640 },
  });
  // Use actual paragraph geometry to supply head tracking at word boundaries.
  await heard("close the magnifier");
  await heard("clear highlight");
  const positions = await page.evaluate(() => {
    const node = document.querySelector("#paragraph")!.firstChild!;
    return [4, 25].map((offset) => {
      const r = document.createRange();
      r.setStart(node, offset);
      r.setEnd(node, offset + 1);
      const b = r.getBoundingClientRect();
      return {
        x: (b.x + b.width / 2) / innerWidth,
        y: (b.y + b.height / 2) / innerHeight,
      };
    });
  });
  const point = async (p: any) =>
    message({
      type: "POINTER",
      sample: {
        ...p,
        confidence: 1,
        timestamp: Date.now(),
        source: "face",
        handHold: false,
        fps: 30,
        latencyMs: 10,
      },
    });
  await point(positions[0]);
  await page.waitForTimeout(100);
  await heard("start highlight");
  await point(positions[1]);
  await page.waitForTimeout(100);
  await point(positions[1]);
  await heard("finish highlight");
  expect(await page.evaluate(() => getSelection()?.toString())).toBe(
    "difficult alpha-2 receptor",
  );
  await message({ type: "PAUSE" });
  await expect(page.locator("#handsfree-reading-tools")).toBeHidden();
});
test("packaged writing maintains scratch/restore, literal commands and focus isolation", async () => {
  await message({ type: "RESUME" });
  await page.evaluate(() => {
    document.body.innerHTML =
      '<textarea rows="8" aria-label="Document body"></textarea><input aria-label="Search" type="search">';
  });
  await heard("writing mode");
  await page.locator("textarea").focus();
  await heard("start dictation");
  await heard("use verbatim dictation");
  await heard("literal scratch that");
  await expect(page.locator("textarea")).toHaveValue("scratch that");
  await heard("scratch that");
  await expect(page.locator("textarea")).toHaveValue("");
  await heard("put that back");
  await expect(page.locator("textarea")).toHaveValue("scratch that");
  await heard("stop dictation");
  await expect
    .poll(async () => (await message({ type: "GET_STATE" })).dictating)
    .toBe(false);
  await page.locator("textarea").focus();
  expect((await message({ type: "GET_STATE" })).dictating).toBe(false);
});

test("contenteditable corrections restore an emptied rich-text paragraph and reject manual edits", async () => {
  await page.evaluate(() => {
    document.body.innerHTML =
      '<main><div contenteditable="true" role="textbox" aria-label="Document body" aria-multiline="true" style="min-height:120px"></div></main>';
  });
  await page.locator("[contenteditable]").focus();
  await heard("writing mode");
  await heard("use verbatim dictation");
  await heard("Temporary rich text.");
  await expect(page.locator("[contenteditable]")).toHaveText(
    "Temporary rich text.",
  );
  await heard("scratch that");
  await expect(page.locator("[contenteditable]")).toHaveText("");
  await heard("put that back");
  await expect(page.locator("[contenteditable]")).toHaveText(
    "Temporary rich text.",
  );
  await page.keyboard.type(" Manual change.");
  await heard("scratch that");
  await expect(page.locator("[contenteditable]")).toContainText(
    "Manual change.",
  );
  await expect
    .poll(async () => (await message({ type: "GET_STATE" })).feedback)
    .toContain("draft changed");
});

test("reading starts audio only on request and exposes pause/resume controls", async () => {
  await heard("stop dictation");
  await page.evaluate(() => {
    document.body.innerHTML =
      "<main><p>First readable paragraph.</p><p>Second readable paragraph.</p></main>";
  });
  const tabId = (await message({ type: "GET_STATE" })).targetTabId;
  await worker.evaluate(
    (tabId) =>
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const audio = {
            calls: [] as string[],
            cancel() {
              this.calls.push("cancel");
            },
            pause() {
              this.calls.push("pause");
            },
            resume() {
              this.calls.push("resume");
            },
            getVoices() {
              return [];
            },
            speak() {
              this.calls.push("speak");
            },
          };
          Object.defineProperty(window, "speechSynthesis", {
            configurable: true,
            value: audio,
          });
          (window as any).readingTestAudio = audio;
        },
      }),
    tabId,
  );
  const calls = async () => {
    const rows = await worker.evaluate(
      (tabId) =>
        chrome.scripting.executeScript({
          target: { tabId },
          func: () => (window as any).readingTestAudio.calls,
        }),
      tabId,
    );
    return rows[0].result as string[];
  };
  await heard("reading mode");
  expect(await calls()).not.toContain("speak");
  await heard("read this article aloud");
  await expect.poll(calls).toContain("speak");
  await page
    .getByRole("button", { name: "Pause reading", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Resume reading", exact: true })
    .click();
  expect(await calls()).toContain("resume");
  await message({ type: "PAUSE" });
  expect((await calls()).at(-1)).toBe("cancel");
});
