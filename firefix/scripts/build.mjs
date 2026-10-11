import { build } from "esbuild";
import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const firefox = true;
const dist = path.join(root, "dist");
let providerConfig = { groqKeys: [], jevKey: "", jevKeys: [] };
try {
  if(firefox || process.env.HANDSFREE_RELEASE==="1")throw Object.assign(new Error("Release excludes local credentials"),{code:"ENOENT"});
  providerConfig = JSON.parse(await readFile(path.join(root, "config/providers.local.json"), "utf8"));
  if (!Array.isArray(providerConfig.groqKeys) || providerConfig.groqKeys.length > 4 || providerConfig.groqKeys.some(key => typeof key !== "string")) throw new Error("Expected at most four Groq keys.");
  if (providerConfig.jevKey !== undefined && typeof providerConfig.jevKey !== "string" || providerConfig.jevKeys !== undefined && (!Array.isArray(providerConfig.jevKeys) || providerConfig.jevKeys.some(key => typeof key !== "string"))) throw new Error("Invalid Jev configuration.");
} catch (error) {
  if (error.code !== "ENOENT") throw new Error("Invalid local provider configuration. Check config/providers.local.json.");
}
execFileSync(process.execPath, [path.join(root, "scripts/assets.mjs")], {
  stdio: "inherit",
});
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const common = {
  bundle: true,
  alias:{"@mediapipe/tasks-vision":path.join(root,"node_modules/@mediapipe/tasks-vision/vision_bundle.mjs")},
  platform: "browser",
  target: firefox ? "firefox140" : "chrome120",
  ...(firefox ? { banner: { js: "var chrome = globalThis.browser || globalThis.chrome;" } } : {}),
  logLevel: "info",
  define: { "process.env.NODE_ENV": '"production"', "__HANDS_FREE_PROVIDERS__": JSON.stringify(providerConfig) },
  legalComments: "linked",
};
await build({
  ...common,
  entryPoints: [path.join(root, "src/background.ts")],
  outfile: path.join(dist, "background.js"),
  format: firefox ? "iife" : "esm",
  ...(firefox ? {
    banner: { js: await readFile(path.join(root, "src/firefox/background.js"), "utf8") },
    plugins: [{ name: "firefox-capture-runtime", setup(builder) {
      builder.onLoad({ filter: /background\.ts$/ }, async args => ({
        contents: (await readFile(args.path, "utf8")).replaceAll("chrome.offscreen", "handsfreeCapture").replaceAll("chrome.tts", "handsfreeNarration"),
        loader: "ts",
      }));
    } }],
  } : {}),
});
await build({
  ...common,
  entryPoints: [path.join(root, "src/content/index.ts")],
  outfile: path.join(dist, "content.js"),
  format: "iife",
});
await build({
  ...common,
  entryPoints: [path.join(root, "src/tracking/worker.ts")],
  outfile: path.join(dist, "tracking-worker.js"),
  format: "iife",
});
await build({
  ...common,
  entryPoints: [path.join(root, "src/gesture-worker.ts")],
  outfile: path.join(dist, "gesture-worker.js"),
  format: "iife",
});
await build({
  ...common,
  entryPoints: [path.join(root, "src/ui/index.tsx")],
  outfile: path.join(dist, "ui.js"),
  format: "iife",
});
for (const name of ["offscreen", "dashboard-bridge", "dashboard-redirect", "permissions"]) {
  await build({ ...common, entryPoints: [path.join(root, `src/${name}.ts`)], outfile: path.join(dist, `${name}.js`), format: "iife" });
}
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
if (firefox) {
  delete manifest.minimum_chrome_version;
  manifest.permissions = manifest.permissions.filter(permission => !["offscreen", "tts"].includes(permission));
  manifest.background = { scripts: ["background.js"] };
  manifest.icons = { "32": "brand/handsfree-icon-32.png", "180": "brand/handsfree-icon-180.png" };
  manifest.browser_specific_settings = { gecko: {
    id: "handsfree@teamloondry.org", strict_min_version: "142.0",
    data_collection_permissions: { required: ["browsingActivity", "websiteContent", "searchTerms", "personalCommunications"] },
  } };
}
await writeFile(path.join(dist, "manifest.json"), JSON.stringify(manifest, null, 2));
await cp(path.join(root, "src/ui/theme.css"), path.join(dist, "theme.css"));
await cp(path.join(root, "brand"), path.join(dist, "brand"), {
  recursive: true,
});
await cp(path.join(root, "fonts"), path.join(dist, "fonts"), {
  recursive: true,
});
await cp(path.join(root, "assets"), path.join(dist, "assets"), {
  recursive: true,
});
await cp(
  path.join(root, "node_modules/@mediapipe/tasks-vision/wasm"),
  path.join(dist, "assets/wasm"),
  { recursive: true },
);
for (const view of ["popup", "controller"]) {
  await writeFile(
    path.join(dist, view + ".html"),
    `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Handsfree ${view === "popup" ? "" : "controls"}</title><link rel="stylesheet" href="theme.css"></head><body data-view="${view}"><div id="root"></div><script src="ui.js"></script></body></html>`,
  );
}
await writeFile(path.join(dist, "offscreen.html"), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Handsfree capture</title></head><body><video id="camera" autoplay muted playsinline></video><script src="offscreen.js"></script></body></html>');
await writeFile(path.join(dist, "dashboard.html"), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Handsfree dashboard</title></head><body><p>Opening your Handsfree dashboard…</p><script src="dashboard-redirect.js"></script></body></html>');
await writeFile(path.join(dist, "permissions.html"), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Handsfree permissions</title><link rel="stylesheet" href="theme.css"></head><body><main id="permissions"></main><script src="permissions.js"></script></body></html>');
console.log("Load unpacked: " + dist);

if (firefox) {
  await cp(path.join(root, "src/firefox/providers.js"), path.join(dist, "firefox-providers.js"));
  await writeFile(path.join(dist, "firefox-providers.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Handsfree voice services</title><link rel="stylesheet" href="theme.css"></head><body><main style="max-width:640px;margin:48px auto;padding:24px"><h1>Voice services</h1><p>Firefox voice commands use Groq transcription. Your microphone audio goes to Groq while voice is enabled. Optional OpenRouter interprets supported command paraphrases; requests beginning with "hey handsfree" use Groq with permitted page context.</p><p>Keys stay in this extension's local storage. This package contains no shared keys. Enter both keys to replace your saved configuration; an empty field clears that provider.</p><p>Firefox does not provide the on-device speech API used for Writing. On-device dictation is unavailable. Setup voice replies need a configured Groq key and microphone access. Camera controls, typed commands and text entered with your keyboard still work.</p><form><label for="groq-key">Groq API key</label><input id="groq-key" type="password" autocomplete="off" style="display:block;width:100%;margin:12px 0 24px"><label for="jev-key">OpenRouter API key, optional</label><input id="jev-key" type="password" autocomplete="off" style="display:block;width:100%;margin:12px 0 24px"><button id="save-providers" type="submit">Save provider keys</button></form><button id="clear-providers" type="button" style="margin-top:16px">Clear provider keys</button><p id="provider-notice" role="status"></p></main><script src="firefox-providers.js"></script></body></html>`);
  const popupHTML = await readFile(path.join(dist, "popup.html"), "utf8");
  await writeFile(path.join(dist, "popup.html"), popupHTML.replace("</body>", '<p style="padding:12px"><a href="firefox-providers.html" target="_blank" rel="noopener">Voice services</a></p></body>'));
  await cp(path.join(root, "src/firefox/capture.js"), path.join(dist, "firefox-capture.js"));
  await writeFile(path.join(dist, "offscreen.html"), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Handsfree capture</title><link rel="stylesheet" href="theme.css"></head><body><main style="max-width:640px;margin:48px auto;padding:24px"><h1>Handsfree is running</h1><p>Keep this tab open while using Handsfree. Allow camera or microphone access when Firefox asks, then return to your webpage.</p><p>Closing this tab stops your session.</p><p><a href="firefox-providers.html" target="_blank" rel="noopener">Set up voice services</a></p><button id="stop-capture">Stop session</button><video id="camera" autoplay muted playsinline style="width:100%;margin-top:24px"></video></main><script src="offscreen.js"></script><script src="firefox-capture.js"></script></body></html>');
}
