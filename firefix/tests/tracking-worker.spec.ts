import { test, expect, chromium } from "@playwright/test";
import path from "node:path";

test("packaged face and hand workers load locally and reject blank camera frames", async () => {
  const dist = path.resolve("dist");
  const context = await chromium.launchPersistentContext("", {
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      "--enable-unsafe-swiftshader",
      "--no-sandbox",
    ],
  });
  try {
    const service =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker", { timeout: 10000 }));
    const page = await context.newPage();
    await page.goto(
      `chrome-extension://${new URL(service.url()).host}/popup.html`,
    );
    for (const mode of ["face", "hand"] as const) {
      const result = await page.evaluate(
        (mode) =>
          new Promise<{ point: unknown; latencyMs: number }>(
            (resolve, reject) => {
              const worker = new Worker(
                chrome.runtime.getURL("tracking-worker.js"),
              );
              const timer = setTimeout(() => {
                worker.terminate();
                reject(new Error("Local tracking worker timed out"));
              }, 20000);
              const finish = () => {
                clearTimeout(timer);
                worker.terminate();
              };
              worker.onerror = (event) => {
                finish();
                reject(new Error(event.message));
              };
              worker.onmessage = (event) => {
                const data = event.data;
                if (data.type === "error") {
                  finish();
                  reject(new Error(data.message));
                } else if (data.type === "ready") {
                  const canvas = new OffscreenCanvas(640, 480),
                    drawing = canvas.getContext("2d")!;
                  drawing.fillStyle = "#555";
                  drawing.fillRect(0, 0, 640, 480);
                  const bitmap = canvas.transferToImageBitmap();
                  worker.postMessage(
                    {
                      type: "frame",
                      bitmap,
                      timestamp: performance.now(),
                      epoch: 0,
                    },
                    [bitmap],
                  );
                } else if (data.type === "sample") {
                  finish();
                  resolve({ point: data.point, latencyMs: data.latencyMs });
                }
              };
              worker.postMessage({
                type: "init",
                mode,
                baseURL: chrome.runtime.getURL(""),
              });
            },
          ),
        mode,
      );
      expect(result.point).toBeNull();
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(Number.isFinite(result.latencyMs)).toBe(true);
    }
  } finally {
    await context.close();
  }
});
