import { execFileSync } from "node:child_process";
console.log(`Handsfree desktop: ${process.platform}/${process.arch}; Node ${process.version}`);
for (const [command, args] of [["rustc", ["--version"]], ["cargo", ["--version"]]]) {
  try { console.log(execFileSync(command, args, { encoding: "utf8" }).trim()); }
  catch { console.log(`${command}: missing`); process.exitCode = 1; }
}
if (process.platform === "darwin") {
  console.log(`macOS ${execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8" }).trim()}`);
  console.log("Primary target: Apple Silicon, macOS 26. Camera and native input-control access are checked in the app.");
} else console.log("Preview UI and policy tests work here. Native input in this milestone is macOS only.");
