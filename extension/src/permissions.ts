import {captureCheck} from "./capture-check";
import { installLocalSpeech } from "./speech";
import { send, type PermissionState, type Settings } from "./shared";

const root = document.querySelector("#permissions")!;
const query = new URLSearchParams(location.search);
const kind = query.get("kind") || "devices";
const selectedCamera = query.get("camera") !== "false";
const selectedMicrophone = query.get("microphone") !== "false";
root.innerHTML = `<section class="permission-setup" aria-labelledby="access-title">
<img src="brand/handsfree-symbol.svg" width="36" height="36" alt="Handsfree">
<p class="permission-eyebrow">A little setup, at your pace</p><h1 id="access-title">Browser access</h1>
<p>Choose the access you need. Your place in setup is saved.</p>
<div class="permission-row" data-kind="pages"><div><label for="pages">Webpage control</label><p>Use Handsfree on websites you visit.</p></div><input type="checkbox" role="switch" id="pages"><span id="pages-state">Checking</span></div>
<div class="permission-row" data-kind="tabs"><div><label for="tabs">Tab commands</label><p>Find and switch tabs by speaking.</p></div><input type="checkbox" role="switch" id="tabs"><span id="tabs-state">Checking</span></div>
<section class="permission-device" data-kind="camera"><h2>Camera</h2><p>Needed for head or hand movement.</p><p id="camera-state">Checking</p><button id="camera">Allow camera</button></section>
<section class="permission-device" data-kind="microphone"><h2>Microphone</h2><p>Needed for voice commands.</p><p id="microphone-state">Checking</p><button id="microphone">Allow microphone</button></section>
<section class="permission-device" data-kind="provider"><h2>Natural language commands</h2><p>Optional access for interpreting commands. Fixed commands work without it.</p><p id="provider-state">Checking</p><button id="providers">Allow command service</button></section>
<section class="permission-device" data-kind="speech"><h2>On-device speech</h2><p>Download your selected language for speech recognition that stays on this device.</p><button id="speech">Install local speech</button></section>
<p class="permission-device-help">Chrome stores device permissions. To revoke access, use Chrome's site settings for this extension.</p>
<p id="status" role="status"></p>
<div class="permission-actions"><button id="read">Read this step aloud</button><button id="quiet">Stop reading</button><button id="return" class="permission-primary">Return to Handsfree</button></div>
</section>`;
const status = root.querySelector("#status")!;
const devices: Partial<Record<"camera" | "microphone", PermissionStatus>> = {};
let updating = false;
for (const section of root.querySelectorAll<HTMLElement>("[data-kind]")) {
  const row = section.dataset.kind;
  section.hidden = kind === "devices" ? !(row === "camera" && selectedCamera || row === "microphone" && selectedMicrophone)
    : row !== kind;
}
function permissionLabel(value: string) {
  return value === "granted" ? "Allowed" : value === "denied" ? "Blocked. Update access in Chrome, then retry." : value === "prompt" ? "Not requested" : "Permission unknown. Choose Allow to check.";
}
async function refresh() {
  const state = await send<PermissionState>({ type: "GET_PERMISSIONS" });
  for (const id of ["pages", "tabs"] as const) {
    (root.querySelector(`#${id}`) as HTMLInputElement).checked = state[id];
    root.querySelector(`#${id}-state`)!.textContent = state[id] ? "Allowed" : "Not allowed";
  }
  for (const id of ["camera", "microphone"] as const) {
    const value = devices[id]?.state ?? "unknown";
    root.querySelector(`#${id}-state`)!.textContent = permissionLabel(value);
    (root.querySelector(`#${id}`) as HTMLButtonElement).hidden = value === "granted";
  }
  root.querySelector("#provider-state")!.textContent = state.provider ? "Allowed" : "Not allowed";
  (root.querySelector("#providers") as HTMLButtonElement).hidden = state.provider;
  await send({ type: "MEDIA_PERMISSIONS", camera: devices.camera?.state ?? "unknown", microphone: devices.microphone?.state ?? "unknown" });
}
function button(id: string, action: () => Promise<string>) {
  const element = root.querySelector(`#${id}`) as HTMLButtonElement;
  element.addEventListener("click", () => {
    element.disabled = true;
    void action().then(text => { status.textContent = text; }, error => { status.textContent = error instanceof Error ? error.message : "Access could not be updated. Retry." })
      .finally(async () => { element.disabled = false; await refresh().catch(() => {}); });
  });
}
for (const id of ["pages", "tabs"] as const) {
  const toggle = root.querySelector(`#${id}`) as HTMLInputElement;
  toggle.addEventListener("change", () => {
    if (updating) return;
    updating = true; toggle.disabled = true;
    const permission: chrome.permissions.Permissions = id === "pages" ? { origins: ["http://*/*", "https://*/*"] } : { permissions: ["tabs"] };
    const operation = toggle.checked ? chrome.permissions.request(permission) : chrome.permissions.remove(permission);
    void operation.then(allowed => { status.textContent = allowed ? "Access updated." : "Chrome did not grant access. You can retry."; }, () => { status.textContent = "Access could not be changed. Retry."; })
      .finally(async () => { await refresh().catch(() => {}); updating = false; toggle.disabled = false; });
  });
}
for (const id of ["camera", "microphone"] as const) button(id, async () => {
  const release=await captureCheck();
  try{
  const stream = await navigator.mediaDevices.getUserMedia(id === "camera" ? {video:true} : {audio:true});
  stream.getTracks().forEach(track => track.stop());
  return `${id === "camera" ? "Camera" : "Microphone"} allowed. Return to Handsfree when you're ready.`;
  }finally{await release();}
});
button("providers", async () => await chrome.permissions.request({ origins: ["https://api.typesafe.ai/*", "https://openrouter.ai/*"] }) ? "Command service allowed." : "Access was not granted. Fixed commands are still available.");
button("speech", async () => { const settings = await send<Settings>({ type: "GET_SETTINGS" }); await installLocalSpeech(settings.language); return "Language ready. Return to Handsfree to start listening."; });
button("read", async () => { await send({type:"UI_SPEAK",text:root.querySelector("h1")!.textContent + ". " + [...root.querySelectorAll<HTMLElement>("[data-kind]")].filter(row=>!row.hidden).map(row=>row.innerText).join(". ") + ". Choose Return to Handsfree when ready."}); return "Reading finished."; });
button("quiet", async () => { await send({type:"UI_SPEAK",text:""}); return "Reading stopped."; });
button("return", async () => { await send({type:"UI_SPEAK",text:""}); await send({ type: "OPEN_DASHBOARD", hash: query.get("return") === "#setup" ? "#setup" : "#preferences" }); window.close(); return "Returning to Handsfree."; });
void Promise.all(["camera", "microphone"].map(async name => {
  try {
    const permission = await navigator.permissions.query({ name: name as PermissionName });
    devices[name as "camera" | "microphone"] = permission;
    permission.addEventListener("change", () => void refresh().catch(() => {}));
  } catch { /* A user can still choose Allow when Chrome cannot expose this state. */ }
})).then(refresh).catch(() => { status.textContent = "Could not read Chrome permissions. Reload the extension and retry."; });
chrome.permissions.onAdded.addListener(() => void refresh().catch(() => {}));
chrome.permissions.onRemoved.addListener(() => void refresh().catch(() => {}));
addEventListener("focus", () => void refresh().catch(() => {}));
