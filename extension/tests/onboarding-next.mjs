// Run with a local Next server. Uses an isolated extension profile and fake devices.
import { chromium, expect } from "@playwright/test";
import { mkdtemp, cp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin =
  process.env.HANDSFREE_DASHBOARD_ORIGIN || "http://localhost:3000";
const temp = await mkdtemp("/tmp/handsfree-onboarding-");
const dist = path.join(temp, "extension");
await cp(path.join(root, "dist"), dist, { recursive: true });
const manifest = JSON.parse(
  await readFile(path.join(dist, "manifest.json"), "utf8"),
);
manifest.permissions.push("tabs");
await writeFile(path.join(dist, "manifest.json"), JSON.stringify(manifest));
const context = await chromium.launchPersistentContext(
  path.join(temp, "profile"),
  {
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: [
      `--load-extension=${dist}`,
      `--disable-extensions-except=${dist}`,
      "--no-sandbox",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
    viewport: { width: 1280, height: 800 },
  },
);
const report = [];
const AxeBuilder = process.env.HANDSFREE_AXE_MODULE
  ? (await import(process.env.HANDSFREE_AXE_MODULE)).default
  : null;
async function audit(page, label) {
  if (!AxeBuilder) return;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const violations = result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => ({
      target: n.target,
      summary: n.failureSummary,
    })),
  }));
  console.log(JSON.stringify({ accessibility: label, violations }));
  expect(violations).toEqual([]);
}

try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const popup = await context.newPage();
  await popup.goto(
    `chrome-extension://${new URL(worker.url()).host}/popup.html`,
  );
  const send = (message) =>
    popup.evaluate((message) => chrome.runtime.sendMessage(message), message);
  await send({ type: "SAVE_PROVIDERS", groqKeys: [], jevKeys: [], jevKey: "" });
  await send({ type: "SET_DASHBOARD_URL", url: `${origin}/dashboard` });
  await worker.evaluate(() => {
    globalThis.setupSpeech = [];
    chrome.tts.stop = () => {};
    chrome.tts.speak = (text, options, callback) => {
      globalThis.setupSpeech.push(text);
      callback?.();
      setTimeout(
        () => options.onEvent?.({ type: "end", charIndex: text.length }),
        20,
      );
    };
  });
  const target = await context.newPage();
  await target.goto(`${origin}/`);
  const tabId = await worker.evaluate(
    async (origin) => (await chrome.tabs.query({ url: `${origin}/` }))[0].id,
    origin,
  );
  const opened = context.waitForEvent("page");
  await send({ type: "OPEN_DASHBOARD", tabId });
  const page = await opened;
  await page.bringToFront();
  await page.waitForLoadState();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(
    page.getByRole("heading", {
      name: "What feels comfortable for you?",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeEnabled();
  await audit(page, "onboarding-choices");
  await expect
    .poll(() => worker.evaluate(() => globalThis.setupSpeech), {
      timeout: 10000,
    })
    .toContain("Would you like spoken guidance?");
  expect((await send({ type: "GET_STATE" })).running).toBe(false);
  report.push({ idleVoiceOffer: true, noSessionAutostart: true });
  await expect(page).toHaveTitle("Dashboard · Handsfree");
  const handChoice = page.getByRole("checkbox", {
    name: "Hand movement",
    exact: true,
  });
  await handChoice.focus();
  await page.keyboard.press("Space");
  await expect
    .poll(async () => (await send({ type: "GET_SETTINGS" })).enabledInputs)
    .toEqual(["voice", "face", "hand"]);
  await expect(handChoice).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("radio", { name: "Head movement", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => (await send({ type: "GET_SETTINGS" })).pointerMode)
    .toBe("hand");
  await expect(
    page.getByRole("radio", { name: "Hand movement", exact: true }),
  ).toBeFocused();
  await handChoice.focus();
  await page.keyboard.press("Space");
  await expect
    .poll(async () => (await send({ type: "GET_SETTINGS" })).enabledInputs)
    .toEqual(["voice", "face"]);
  report.push({ keyboardSelection: true, focusPreservedAfterSave: true });
  await page
    .getByRole("checkbox", { name: "Head movement", exact: true })
    .uncheck();
  await expect
    .poll(async () => (await send({ type: "GET_SETTINGS" })).enabledInputs)
    .toEqual(["voice"]);
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Voice", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Head movement", exact: true }),
  ).not.toBeChecked();
  const voiceChoice = page.getByRole("checkbox", {
    name: "Voice",
    exact: true,
  });
  await voiceChoice.uncheck();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".onboarding-error")).toHaveText(
    "Choose at least one way to control Handsfree.",
  );
  await expect(voiceChoice).toBeFocused();
  await page.keyboard.press("Space");
  await expect(voiceChoice).toBeChecked();
  report.push({ emptySelectionValidation: true });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "A little access to get started.",
      exact: true,
    }),
  ).toBeVisible();
  await audit(page, "onboarding-access");
  await expect(page.locator(".onboarding-access-list")).not.toContainText(
    "Camera",
  );
  await expect(page.locator(".onboarding-access-list")).toContainText(
    "Microphone",
  );
  const permissionOpened = context.waitForEvent("page");
  await page
    .getByRole("button", { name: "Allow selected devices", exact: true })
    .click();
  const access = await permissionOpened;
  await access.waitForLoadState();
  await expect(access.locator("[data-kind=microphone]")).toBeVisible();
  await audit(access, "microphone-permission");
  await expect(access.locator("[data-kind=camera]")).not.toBeVisible();
  if (
    await access
      .getByRole("button", { name: "Allow microphone", exact: true })
      .isVisible()
  )
    await access
      .getByRole("button", { name: "Allow microphone", exact: true })
      .click();
  await expect(access.locator("#microphone-state")).toHaveText("Allowed");
  await access
    .getByRole("button", { name: "Return to Handsfree", exact: true })
    .click();
  await page.bringToFront();
  await expect(
    page.getByRole("heading", {
      name: "A little access to get started.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Your selected devices are allowed.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Listen for setup commands", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop listening", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      worker.evaluate(() =>
        chrome.runtime.getContexts({
          contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        }),
      ),
    )
    .not.toHaveLength(0);
  await send({ type: "UI_HEARD", text: "next" });
  await expect(
    page.getByRole("heading", { name: "Ready when you are.", exact: true }),
  ).toBeVisible();
  await audit(page, "onboarding-practice");
  await send({ type: "UI_HEARD", text: "finish setup" });
  await expect(
    page.getByRole("heading", { name: "Your session", exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () => (await send({ type: "GET_SETTINGS" })).onboardingCompleted,
    )
    .toBe(true);
  report.push({
    voiceOnlyNoCamera: true,
    permissionHandoffReturns: true,
    progressPersist: true,
    setupVoiceBeforeSession: true,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your session", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Profile and preferences", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Voice", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("checkbox", { name: "Head movement", exact: true })
    .check();
  await expect
    .poll(async () => (await send({ type: "GET_SETTINGS" })).enabledInputs)
    .toEqual(["voice", "face"]);
  await page
    .getByRole("checkbox", { name: "Hand movement", exact: true })
    .check();
  await page.getByRole("radio", { name: "Hand movement", exact: true }).check();
  await expect
    .poll(async () => (await send({ type: "GET_SETTINGS" })).pointerMode)
    .toBe("hand");
  await page
    .getByRole("button", { name: "Back to session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause session", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show camera preview", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".dashboard-camera video")).toBeHidden();
  await page
    .getByRole("button", { name: "Pause session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Profile and preferences", exact: true })
    .click();
  await page.getByRole("radio", { name: "Head movement", exact: true }).check();
  await expect
    .poll(async () => (await send({ type: "GET_SETTINGS" })).pointerMode)
    .toBe("face");
  expect((await send({ type: "GET_STATE" })).paused).toBe(true);
  await page
    .getByRole("button", { name: "Back to session", exact: true })
    .click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  report.push({
    allInputs: true,
    deliberatePointerSwitch: true,
    pausePreserved: true,
    previewOptIn: true,
  });
  await page
    .getByRole("button", { name: "Profile and preferences", exact: true })
    .click();
  for (const combination of [
    ["voice"],
    ["face"],
    ["hand"],
    ["voice", "face"],
    ["voice", "hand"],
    ["face", "hand"],
    ["voice", "face", "hand"],
  ]) {
    await send({
      type: "SAVE_SETTINGS",
      settings: {
        ...(await send({ type: "GET_SETTINGS" })),
        enabledInputs: combination,
      },
    });
    await page.reload();
    for (const [input, name] of [
      ["voice", "Voice"],
      ["face", "Head movement"],
      ["hand", "Hand movement"],
    ])
      await expect(
        page.getByRole("checkbox", { name, exact: true }),
      ).toHaveJSProperty("checked", combination.includes(input));
  }
  report.push({ sevenCombinationsPersist: true });
  await mkdir(path.join(root, "test-results"), { recursive: true });
  for (const view of [
    "preferences",
    "pointer",
    "gestures",
    "voice",
    "access",
    "providers",
    "activity",
    "overview",
    "tabs",
    "help",
  ]) {
    await page.goto(`${origin}/dashboard#${view}`);
    await expect(
      page.locator('[role="tabpanel"][data-state="active"]'),
    ).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await audit(page, `${view}-light`);
    if (AxeBuilder) {
      await page
        .getByRole("button", { name: "Toggle color theme", exact: true })
        .click();
      await expect(page.locator("html")).toHaveClass(/dark/);
      await page.waitForFunction(
        () => !document.documentElement.dataset.pitchDirection,
      );
      await audit(page, `${view}-dark`);
      await page
        .getByRole("button", { name: "Toggle color theme", exact: true })
        .click();
      await expect(page.locator("html")).not.toHaveClass(/dark/);
      await page.waitForFunction(
        () => !document.documentElement.dataset.pitchDirection,
      );
    }
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await expect
        .poll(
          () =>
            page.evaluate(
              () => document.documentElement.scrollWidth - innerWidth,
            ),
          { message: `Overflow ${view} ${width}` },
        )
        .toBeLessThanOrEqual(0);
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        { message: `Text resize overflow ${view}` },
      )
      .toBeLessThanOrEqual(0);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
  }
  await page.goto(`${origin}/dashboard#preferences`);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({
    path: path.join(root, "test-results", "preferences-new.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Replay setup", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "What feels comfortable for you?",
      exact: true,
    }),
  ).toBeVisible();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
  await page.screenshot({
    path: path.join(root, "test-results", "onboarding-new.png"),
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({
    path: path.join(root, "test-results", "onboarding-reduced-motion.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  report.push({
    reflow: true,
    returningUser: true,
    replaySetup: true,
    pageErrors: errors,
  });
  await writeFile(
    path.join(root, "test-results", "onboarding-connected.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await context.close();
  await rm(temp, { recursive: true, force: true });
}
