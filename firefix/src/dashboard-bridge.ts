// This isolated-world script is injected only into the configured dashboard tab.
const bridgeWindow = window as Window & { __handsfreeBridge?: boolean };
if (!bridgeWindow.__handsfreeBridge) {
  bridgeWindow.__handsfreeBridge = true;
  const origin = location.origin;
  addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== origin || event.data?.channel !== "handsfree-dashboard-request") return;
    const { id, message } = event.data;
    if (typeof id !== "string" || id.length > 80 || !message || typeof message.type !== "string") return;
    try {
      const result = await chrome.runtime.sendMessage(message);
      window.postMessage({ channel: "handsfree-dashboard-response", id, result }, origin);
    } catch {
      window.postMessage({
        channel: "handsfree-dashboard-response", id,
        result: { ok: false, error: "Extension connection lost. Refresh this page, then open the dashboard from the Handsfree popup." },
      }, origin);
    }
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "STATE") window.postMessage({ channel: "handsfree-dashboard-state", state: message.state }, origin);
    if (message?.type === "UI_HEARD") window.postMessage({ channel: "handsfree-dashboard-heard", text: message.text }, origin);
  });
  window.postMessage({ channel: "handsfree-dashboard-ready" }, origin);
}

export {};
