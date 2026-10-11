import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const root = path.resolve(import.meta.dirname, "..");
const extension = root;
execFileSync(process.execPath, [path.join(extension, "scripts/build.mjs"), "--firefox"], { stdio: "inherit" });
const version = JSON.parse(await readFile(path.join(extension, "manifest.json"), "utf8")).version;
const artifacts = path.join(root, "releases");
await mkdir(artifacts, { recursive: true });
const packagePath = path.join(artifacts, `handsfree-firefox-${version}.zip`);
await rm(packagePath, { force: true });
execFileSync("zip", ["-qr", packagePath, "."], { cwd: path.join(extension, "dist") });
// AMO reviewers need original sources and the exact inputs for bundled output.
const staging = await mkdtemp(path.join(os.tmpdir(), "handsfree-firefox-source-"));
try {
  for (const name of ["src", "scripts", "manifest.json", "package.json", "package-lock.json", "tsconfig.json", "vitest.config.ts", "shared", "brand", "fonts", "tests", "assets"]) {
    await cp(path.join(extension, name), path.join(staging, "firefix", name), { recursive: true });
  }
  await cp(path.join(root, "README.md"), path.join(staging, "firefix/README.md"));
  const sourcePath = path.join(artifacts, `handsfree-firefox-${version}-source.zip`);
  await rm(sourcePath, { force: true });
  execFileSync("zip", ["-qr", sourcePath, "."], { cwd: staging });
  console.log(`Firefox upload package: ${packagePath}\nReviewer sources: ${sourcePath}`);
} finally { await rm(staging, { recursive: true, force: true }); }
