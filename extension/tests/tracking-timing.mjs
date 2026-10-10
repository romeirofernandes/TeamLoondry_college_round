// Standalone camera-presentation starvation regression. --natural measures without injected starvation.
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { mkdtemp, cp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {execFileSync} from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp("/tmp/handsfree-timing-");
const dist = path.join(temp, "extension");
const baseline=process.argv.find(argument=>argument.startsWith("--baseline="))?.slice(11);
let trackerSource=root+"/src/tracking/index.ts";
if(baseline){
  const baselineSource=path.join(temp,"baseline");
  await cp(root+"/src",baselineSource,{recursive:true});
  trackerSource=baselineSource+"/tracking/index.ts";
  await writeFile(trackerSource,execFileSync("git",["show",`${baseline}:extension/src/tracking/index.ts`],{cwd:root}));
}
await cp(root + "/dist", dist, { recursive: true });
const manifest = JSON.parse(await readFile(dist + "/manifest.json", "utf8"));
manifest.permissions = [...new Set([...manifest.permissions, "offscreen"])];
await writeFile(dist + "/manifest.json", JSON.stringify(manifest));
await writeFile(
  dist + "/background.js",
  "chrome.runtime.onInstalled.addListener(()=>{});",
);
await writeFile(
  dist + "/diagnostic.html",
  '<!DOCTYPE html><video id="video" muted autoplay></video><script src="diagnostic.js"></script>',
);
await build({
  stdin: {
    contents: `import {Tracker} from ${JSON.stringify(trackerSource)}; import {defaults} from ${JSON.stringify(root + "/src/shared.ts")};
// The old baseline directly used storage. Its isolated fixture needs this shim,
// while the current implementation receives a memory-only persistence adapter.
if(${!!baseline}&&!chrome.storage)Object.defineProperty(chrome,'storage',{value:{local:{get:async()=>({}),set:async()=>{}}}});
window.stats={samples:[],timers:0,videoFrames:0,trackFrames:0,status:{}};
const video=document.querySelector('video');window.tracker=new Tracker(video,sample=>{if(sample.latencyMs>0)window.stats.samples.push({at:performance.now(),timestamp:sample.timestamp,latencyMs:sample.latencyMs});},patch=>Object.assign(window.stats.status,patch),{getCalibration:async()=>undefined,saveCalibration:async()=>{}});
window.start=async()=>{await window.tracker.start(defaults);setInterval(()=>window.stats.timers++,33);const vf=()=>{window.stats.videoFrames++;video.requestVideoFrameCallback(vf);};video.requestVideoFrameCallback(vf);
if(typeof MediaStreamTrackProcessor==='function'){const reader=new MediaStreamTrackProcessor({track:video.srcObject.getVideoTracks()[0],maxBufferSize:1}).readable.getReader();window.trackReader=reader;const read=async()=>{while(true){const result=await reader.read();if(result.done)break;window.stats.trackFrames++;result.value.close();}};void read();}}
window.clearStats=()=>{window.stats.samples=[];window.stats.timers=0;window.stats.videoFrames=0;window.stats.trackFrames=0;};
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{if(msg.type==='DIAG_START'){void window.start().then(()=>respond(true));return true;}if(msg.type==='DIAG_CLEAR'){window.clearStats();respond(true);}if(msg.type==='DIAG_STARVE'){video.pause();respond(true);}if(msg.type==='DIAG_STATS')respond(window.getStats());});
window.getStats=()=>({...window.stats,visibility:document.visibilityState,previewPaused:video.paused,videoTime:video.currentTime,processor:typeof MediaStreamTrackProcessor});`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  nodePaths:[root+"/node_modules"],
  format: "iife",
  platform: "browser",
  target: "chrome120",
  outfile: dist + "/diagnostic.js",
  logLevel: "silent",
});
const context = await chromium.launchPersistentContext(
  path.join(temp, "profile"),
  {
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    ignoreDefaultArgs: [
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
    args: [
      "--load-extension=" + dist,
      "--disable-extensions-except=" + dist,
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--enable-unsafe-swiftshader",
      "--no-sandbox",
    ],
  },
);
try {
  const sw =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 10000 }));
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await page.goto("chrome-extension://" + id + "/diagnostic.html");
  await page.evaluate(() => window.start());
  await page.waitForTimeout(1000);
  const results = [];
  await page.evaluate(() => window.clearStats());
  await new Promise((r) => setTimeout(r, 4000));
  let stats = await page.evaluate(() => window.getStats());
  function summarize(stats, phase) {
    const times = stats.samples.map((s) => s.at);
    const intervals = times.slice(1).map((t, i) => t - times[i]);
    const p95 =
      intervals.sort((a, b) => a - b)[Math.floor(intervals.length * 0.95)] ??
      null;
    const result = {
      visibility: stats.visibility,
      previewPaused: stats.previewPaused,
      phase,
      inferenceFps: stats.samples.length / 4,
      inferenceFrames: stats.samples.length,
      timerFps: stats.timers / 4,
      videoFrameFps: stats.videoFrames / 4,
      trackFrameFps: stats.trackFrames / 4,
      processor: stats.processor,
      p95IntervalMs: p95,
      backend: stats.status.trackingBackend,
    };
    results.push(result);
    console.log(JSON.stringify(result));
  }
  summarize(stats, "foreground");
  await page.close();
  await sw.evaluate(async () => {
    await chrome.offscreen.createDocument({
      url: "diagnostic.html",
      reasons: ["USER_MEDIA", "WORKERS"],
      justification:
        "Measure local camera tracking when its document is hidden",
    });
  });
  await sw.evaluate(() => chrome.runtime.sendMessage({ type: "DIAG_START" }));
  await new Promise((r) => setTimeout(r, 1000));
  if (!process.argv.includes("--natural"))
    await sw.evaluate(() =>
      chrome.runtime.sendMessage({ type: "DIAG_STARVE" }),
    );
  await sw.evaluate(() => chrome.runtime.sendMessage({ type: "DIAG_CLEAR" }));
  await new Promise((r) => setTimeout(r, 4000));
  stats = await sw.evaluate(() =>
    chrome.runtime.sendMessage({ type: "DIAG_STATS" }),
  );
  summarize(stats, "offscreen");
  const failed = results[1].inferenceFps < results[0].inferenceFps * 0.65;
  console.log(
    failed
      ? "FAIL: background inference delivery degraded >35%"
      : "PASS: background delivery maintained",
  );
  process.exitCode = failed ? 1 : 0;
} finally {
  await context.close();
  await rm(temp, { recursive: true, force: true });
}
