import { installLocalSpeech } from "./speech";
import { send, type PermissionState, type Settings } from "./shared";
const root = document.querySelector("#permissions")!;
root.innerHTML = `<section class="permission-setup"><img src="brand/handsfree-symbol.svg" width="36" height="36" alt="Handsfree"><h1>Browser access</h1><p>These states come from Chrome. Grant only the access you want to use.</p>
<div class="permission-row"><div><label for="pages">Webpage control</label><p>Point, click and control embedded players.</p></div><input type="checkbox" role="switch" id="pages"><span id="pages-state">Checking</span></div>
<div class="permission-row"><div><label for="tabs">Tab commands</label><p>Switch tabs and choose tabs by title.</p></div><input type="checkbox" role="switch" id="tabs"><span id="tabs-state">Checking</span></div>
<div class="permission-row"><div><label for="camera">Camera</label><p>Face and hand tracking.</p></div><input type="checkbox" role="switch" id="camera" disabled aria-describedby="device-help"><span id="camera-state">Checking</span></div>
<div class="permission-row"><div><label for="microphone">Microphone</label><p>Commands, dictation and spoken resume.</p></div><input type="checkbox" role="switch" id="microphone" disabled aria-describedby="device-help"><span id="microphone-state">Checking</span></div>
<p id="device-help">Device switches show Chrome's grant. Enable below; revoke camera or microphone in Chrome's site settings.</p>
<div class="permission-actions"><button id="media">Enable camera and microphone</button><button id="providers">Enable Jev access</button><button id="speech">Install local speech</button></div>
<p id="status" role="status" aria-live="polite"></p></section>`;
const status = root.querySelector("#status")!;
const devices: Partial<Record<"camera" | "microphone", PermissionStatus>> = {};
let updating = false;
function render(id: string, enabled: boolean, label: string) {
  (root.querySelector(`#${id}`) as HTMLInputElement).checked = enabled;
  root.querySelector(`#${id}-state`)!.textContent = label;
}
async function refresh() {
  const state = await send<PermissionState>({ type: "GET_PERMISSIONS" });
  for (const id of ["pages", "tabs"] as const) render(id, state[id], state[id] ? "Enabled" : "Not enabled");
  for (const id of ["camera", "microphone"] as const) {
    const value = devices[id]?.state ?? "unknown";
    render(id, value === "granted", value === "granted" ? "Enabled" : value === "denied" ? "Blocked" : value === "prompt" ? "Not enabled" : "Check in Chrome");
  }
  (root.querySelector("#providers") as HTMLButtonElement).textContent = state.provider ? "Jev access enabled" : "Enable Jev access";
  await send({ type: "MEDIA_PERMISSIONS", camera: devices.camera?.state ?? "unknown", microphone: devices.microphone?.state ?? "unknown" });
}
function button(id: string, action: () => Promise<string>) {
  const element = root.querySelector(`#${id}`) as HTMLButtonElement;
  element.addEventListener("click", () => {
    element.disabled = true;
    void action().then(text => { status.textContent = text; }, error => { status.textContent = error instanceof Error ? error.message : "Permission failed. Retry." })
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
button("media", async () => {
  const results = await Promise.allSettled(["video", "audio"].map(kind => navigator.mediaDevices.getUserMedia({ [kind]: true }).then(stream => stream.getTracks().forEach(track => track.stop()))));
  return results.every(result => result.status === "fulfilled") ? "Camera and microphone enabled. Return to the dashboard and start." : "A device was blocked. Allow it in Chrome's site settings, then retry.";
});
button("providers", async () => await chrome.permissions.request({ origins: ["https://api.typesafe.ai/*", "https://openrouter.ai/*"] }) ? "Jev access enabled." : "Jev access denied. Local commands still work.");
button("speech", async () => { const settings = await send<Settings>({ type: "GET_SETTINGS" }); await installLocalSpeech(settings.language); return "Local language pack ready. Restart the session."; });
void Promise.all(["camera", "microphone"].map(async name => {
  try {
    const permission = await navigator.permissions.query({ name: name as PermissionName });
    devices[name as "camera" | "microphone"] = permission;
    permission.addEventListener("change", () => void refresh().catch(() => {}));
  } catch { /* Chrome may not expose device permission queries. */ }
})).then(refresh).catch(() => { status.textContent = "Could not read Chrome permissions. Reload the extension and retry."; });
chrome.permissions.onAdded.addListener(() => void refresh().catch(() => {}));
chrome.permissions.onRemoved.addListener(() => void refresh().catch(() => {}));
addEventListener("focus", () => void refresh().catch(() => {}));
