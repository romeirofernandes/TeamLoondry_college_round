import { build } from "esbuild";
import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
let providerConfig = { groqKeys: [], jevKey: "", jevKeys: [] };
try {
  if(process.env.HANDSFREE_RELEASE==="1")throw Object.assign(new Error("Release excludes local credentials"),{code:"ENOENT"});
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
  target: "chrome120",
  logLevel: "info",
  define: { "process.env.NODE_ENV": '"production"', "__HANDS_FREE_PROVIDERS__": JSON.stringify(providerConfig) },
  legalComments: "linked",
};
await build({
  ...common,
  entryPoints: [path.join(root, "src/background.ts")],
  outfile: path.join(dist, "background.js"),
  format: "esm",
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
await writeFile(path.join(dist, "docs-bootstrap.js"), 'window._docs_annotate_canvas_by_ext = "handsfree";\n');
await cp(path.join(root, "manifest.json"), path.join(dist, "manifest.json"));
await cp(path.join(root, "src/ui/theme.css"), path.join(dist, "theme.css"));
await cp(path.resolve(root, "../next/public/brand"), path.join(dist, "brand"), {
  recursive: true,
});
await cp(path.resolve(root, "../next/app/fonts"), path.join(dist, "fonts"), {
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
