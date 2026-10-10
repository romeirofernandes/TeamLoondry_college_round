import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const assets = path.join(root, "public/assets");
await mkdir(path.join(assets, "models"), { recursive: true });
const models = [
  ["face", "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"],
  ["hand", "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1"]
];
for (const [name, expected] of models) {
  const file = `${name}_landmarker.task`;
  let bytes;
  try { bytes = await readFile(path.join(assets, "models", file)); }
  catch {
    try { bytes = await readFile(path.join(root, "../extension/assets/models", file)); }
    catch {
      const response = await fetch(`https://storage.googleapis.com/mediapipe-models/${name}_landmarker/${name}_landmarker/float16/1/${file}`);
      if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
  }
  if (createHash("sha256").update(bytes).digest("hex") !== expected) throw new Error(`Model checksum failed: ${file}`);
  await writeFile(path.join(assets, "models", file), bytes);
}
await cp(path.join(root, "node_modules/@mediapipe/tasks-vision/wasm"), path.join(assets, "wasm"), { recursive: true });
await cp(path.join(root, "../next/app/fonts/manrope-latin-500-normal.woff2"), path.join(assets, "manrope.woff2"));
console.log("Local vision models verified; WASM and font assets ready.");
