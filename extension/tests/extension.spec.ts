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
  manifest.host_permissions = ["http://127.0.0.1/*"];
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
  await controls.goto(`chrome-extension://${id}/controller.html`);
  page = await context.newPage();
  await page.goto("http://127.0.0.1:4177");
  const tabId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: "http://127.0.0.1:4177/*" });
    return tabs[0].id!;
  });
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
test("dictation words do not navigate; submission requires confirmation", async () => {
  await point("#search");
  await heard("start typing");
  await heard("scroll down");
  await heard("hello world");
  await expect(page.locator("#search")).toHaveValue("scroll down hello world");
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await heard("stop typing");
  await heard("submit form");
  await expect(page.locator("#submissions")).toHaveText("0");
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
  await heard("find careers page");
  expect((await message({ type: "GET_STATE" })).feedback).toContain(
    "Arbitrary find is off",
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
  await heard("close tab");
  expect(second.isClosed()).toBe(false);
  await heard("cancel");
  expect(second.isClosed()).toBe(false);
  await heard("close tab");
  await heard("confirm");
  await expect.poll(() => second.isClosed()).toBe(true);
});
test("packaged worker and camera start, stop releases capture, popup theme persists", async () => {
  // Reset target after prior close so camera/controller lifecycle is independent of tabs test.
  const id = worker.url().split("/")[2];
  await page.bringToFront();
  await controls.bringToFront();
  await controls
    .getByRole("button", { name: /^(Start|Restart) session$/ })
    .click();
  await expect
    .poll(async () => (await message({ type: "GET_STATE" })).trackingBackend, {
      timeout: 30000,
    })
    .toBe("Worker / CPU");
  await expect
    .poll(() =>
      controls
        .locator("video")
        .evaluate((el) => (el as HTMLVideoElement).srcObject !== null),
    )
    .toBe(true);
  await controls.getByRole("button", { name: "Stop", exact: true }).click();
  await expect
    .poll(() =>
      controls
        .locator("video")
        .evaluate((el) => (el as HTMLVideoElement).srcObject === null),
    )
    .toBe(true);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await expect(
    popup.getByRole("button", { name: "Open controls" }),
  ).toBeVisible();
  await popup.getByRole("button", { name: "Toggle color theme" }).click();
  const dark = await popup
    .locator("html")
    .evaluate((el) => el.classList.contains("dark"));
  await popup.reload();
  await expect
    .poll(() =>
      popup.locator("html").evaluate((el) => el.classList.contains("dark")),
    )
    .toBe(dark);
  await controls.screenshot({
    path: "test-results/controller.png",
    fullPage: true,
  });
});

test("closing the owned control window stops the session", async () => {
  const tabId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: "http://127.0.0.1:4177/" });
    return tabs[0].id!;
  });
  const opened = context.waitForEvent("page");
  await message({ type: "OPEN_CONTROLLER", tabId });
  const owned = await opened;
  await owned.waitForLoadState();
  await owned
    .getByRole("button", { name: /^(Start|Restart) session$/ })
    .click();
  await expect
    .poll(async () => (await message({ type: "GET_STATE" })).trackingBackend, {
      timeout: 30000,
    })
    .toBe("Worker / CPU");
  await owned.close();
  await expect
    .poll(async () => (await message({ type: "GET_STATE" })).running)
    .toBe(false);
});

test("stop during an outstanding settings save cannot acquire camera afterward", async () => {
  await controls.reload();
  await controls.evaluate(() => {
    const scope = window as any;
    const runtime = chrome.runtime as any;
    const original = runtime.sendMessage.bind(runtime);
    const camera = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    scope.cameraStarts = 0;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      scope.cameraStarts++;
      return camera(constraints);
    };
    runtime.sendMessage = async (msg: any) => {
      if (msg.type === "SAVE_SETTINGS")
        await new Promise<void>((resolve) => {
          scope.releaseSave = resolve;
        });
      return original(msg);
    };
  });
  await controls
    .getByRole("button", { name: /^(Start|Restart) session$/ })
    .click();
  await expect
    .poll(() => controls.evaluate(() => typeof (window as any).releaseSave))
    .toBe("function");
  await controls.getByRole("button", { name: "Stop", exact: true }).click();
  await controls.evaluate(() => (window as any).releaseSave());
  await expect(
    controls.getByRole("button", { name: "Start session", exact: true }),
  ).toBeEnabled();
  expect(await controls.evaluate(() => (window as any).cameraStarts)).toBe(0);
  expect((await message({ type: "GET_STATE" })).running).toBe(false);
});

test("pause during camera startup cannot start speech until resumed", async () => {
  await controls.reload();
  await controls.evaluate(() => {
    const scope = window as any;
    const camera = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    scope.speechStarts = 0;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      await new Promise<void>((resolve) => {
        scope.releaseCamera = resolve;
      });
      return camera(constraints);
    };
    class MockSpeech {
      static async available() {
        return "available";
      }
      processLocally = true;
      lang = "";
      continuous = true;
      interimResults = false;
      maxAlternatives = 1;
      onstart: null | (() => void) = null;
      onend = null;
      onresult = null;
      onerror = null;
      start() {
        scope.speechStarts++;
        this.onstart?.();
      }
      abort() {}
    }
    Object.defineProperty(window, "SpeechRecognition", {
      value: MockSpeech,
      configurable: true,
    });
  });
  await controls
    .getByRole("button", { name: /^(Start|Restart) session$/ })
    .click();
  await expect
    .poll(() => controls.evaluate(() => typeof (window as any).releaseCamera))
    .toBe("function");
  await controls
    .getByRole("button", { name: "Pause all", exact: true })
    .click();
  await controls.evaluate(() => (window as any).releaseCamera());
  await expect(
    controls.getByRole("button", { name: "Restart session", exact: true }),
  ).toBeEnabled();
  expect((await message({ type: "GET_STATE" })).paused).toBe(true);
  expect(await controls.evaluate(() => (window as any).speechStarts)).toBe(0);
  await controls.getByRole("button", { name: "Resume", exact: true }).click();
  await expect
    .poll(() => controls.evaluate(() => (window as any).speechStarts))
    .toBe(1);
  await controls.getByRole("button", { name: "Stop", exact: true }).click();
});

test("local notices do not hide close-tab confirmation feedback", async () => {
  await controls
    .getByRole("button", { name: "Mark task start", exact: true })
    .click();
  await expect(controls.locator(".local-notice")).toHaveText(
    "Task timer started.",
  );
  await heard("close tab");
  await expect(controls.locator(".feedback")).toContainText("Say confirm");
  await heard("cancel");
});

test("pause and resume during speech availability restarts cancelled startup", async () => {
  await controls.reload();
  await controls.evaluate(() => {
    const scope = window as any;
    scope.speechStarts = 0;
    scope.availabilityChecks = 0;
    class DelayedSpeech {
      static async available() {
        scope.availabilityChecks++;
        if (scope.availabilityChecks === 1)
          await new Promise<void>((resolve) => {
            scope.releaseSpeech = resolve;
          });
        return "available";
      }
      processLocally = true;
      lang = "";
      continuous = true;
      interimResults = false;
      maxAlternatives = 1;
      onstart: null | (() => void) = null;
      onend = null;
      onresult = null;
      onerror = null;
      start() {
        scope.speechStarts++;
        this.onstart?.();
      }
      abort() {}
    }
    Object.defineProperty(window, "SpeechRecognition", {
      value: DelayedSpeech,
      configurable: true,
    });
  });
  await controls
    .getByRole("button", { name: /^(Start|Restart) session$/ })
    .click();
  await expect
    .poll(() => controls.evaluate(() => typeof (window as any).releaseSpeech), {
      timeout: 30000,
    })
    .toBe("function");
  await controls
    .getByRole("button", { name: "Pause all", exact: true })
    .click();
  await controls.getByRole("button", { name: "Resume", exact: true }).click();
  await controls.evaluate(() => (window as any).releaseSpeech());
  await expect
    .poll(() => controls.evaluate(() => (window as any).speechStarts))
    .toBe(1);
  expect((await message({ type: "GET_STATE" })).paused).toBe(false);
  await controls.getByRole("button", { name: "Stop", exact: true }).click();
});
