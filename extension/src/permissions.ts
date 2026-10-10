import { installLocalSpeech } from "./speech";
import { send, type Settings } from "./shared";
const root = document.querySelector("#permissions")!;
root.innerHTML = `<div style="max-width:440px;padding:28px;margin:auto"><img src="brand/handsfree-symbol.svg" width="36" height="36" alt="Handsfree"><h1>Make room to browse.</h1><p>Choose what Handsfree can use. You can change these permissions later in Chrome.</p><div style="display:grid;gap:12px"><button id="media">Enable camera and microphone</button><button id="pages">Enable webpage control</button><button id="tabs">Enable tab commands</button><button id="providers">Enable Jev</button><button id="speech">Install local speech</button></div><p id="status" role="status" aria-live="polite"></p></div>`;
const status = root.querySelector("#status")!;
function button(id: string, action: () => Promise<string>) {
  const element = root.querySelector(`#${id}`) as HTMLButtonElement;
  element.addEventListener("click", () => {
    element.disabled = true;
    void action().then(text => { status.textContent = text; }, error => { status.textContent = error instanceof Error ? error.message : "Permission failed. Retry."; }).finally(() => { element.disabled = false; });
  });
}
button("media", async () => {
  const results = await Promise.allSettled([
    navigator.mediaDevices.getUserMedia({ video: true }).then(stream => stream.getTracks().forEach(track => track.stop())),
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => stream.getTracks().forEach(track => track.stop())),
  ]);
  return results.every(result => result.status === "fulfilled") ? "Camera and microphone enabled. Return to the dashboard and start." : "A media permission was denied. Allow it in Chrome, then retry. The available input still works.";
});
button("pages", async () => await chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] }) ? "Webpage control enabled." : "Webpage access denied. You can retry here.");
button("tabs", async () => await chrome.permissions.request({ permissions: ["tabs"] }) ? "Tab commands enabled." : "Tab access denied. You can retry here.");
button("providers", async () => await chrome.permissions.request({ origins: ["https://api.typesafe.ai/*", "https://openrouter.ai/*"] }) ? "Jev access enabled. Add its key in the dashboard." : "Jev access denied. Fixed commands still work.");
button("speech", async () => { const settings = await send<Settings>({ type: "GET_SETTINGS" }); await installLocalSpeech(settings.language); return "Local language pack ready. Restart the session."; });
