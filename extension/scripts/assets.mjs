import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const models = {
  "face_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  "hand_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
};
await mkdir(path.join(root, "assets/models"), { recursive: true });
const expected = {
  "face_landmarker.task":
    "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
  "hand_landmarker.task":
    "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1",
};
const hashes = {};
for (const [name, url] of Object.entries(models)) {
  const file = path.join(root, "assets/models", name);
  let bytes;
  try {
    bytes = await readFile(file);
  } catch {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error("Model download failed: " + response.status);
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 100000) throw new Error("Invalid model download");
    await writeFile(file, bytes);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== expected[name])
    throw new Error(
      "Model checksum mismatch: " +
        name +
        ". Remove the cached asset and retry.",
    );
  hashes[name] = { url, sha256, bytes: bytes.length };
}
await writeFile(
  path.join(root, "assets/models/source.json"),
  JSON.stringify(hashes, null, 2) + "\n",
);
console.log("Local model assets ready:", Object.keys(models).join(", "));
