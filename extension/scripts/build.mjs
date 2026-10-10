import { build } from "esbuild";
import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
execFileSync(process.execPath, [path.join(root, "scripts/assets.mjs")], {
  stdio: "inherit",
});
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const common = {
  bundle: true,
  platform: "browser",
  target: "chrome120",
  logLevel: "info",
  define: { "process.env.NODE_ENV": '"production"' },
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
  entryPoints: [path.join(root, "src/ui/index.tsx")],
  outfile: path.join(dist, "ui.js"),
  format: "iife",
});
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
console.log("Load unpacked: " + dist);
