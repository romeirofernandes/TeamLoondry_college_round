// This isolated-world script is injected only into the configured dashboard tab.
const bridgeWindow = window as Window & { __handsfreeBridge?: boolean };
if (!bridgeWindow.__handsfreeBridge) {
  bridgeWindow.__handsfreeBridge = true;
  const origin = location.origin;
  addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== origin || event.data?.channel !== "handsfree-dashboard-request") return;
    const { id, message } = event.data;
    if (typeof id !== "string" || id.length > 80 || !message || typeof message.type !== "string") return;
    void chrome.runtime.sendMessage(message).then(
      result => window.postMessage({ channel: "handsfree-dashboard-response", id, result }, origin),
      () => window.postMessage({ channel: "handsfree-dashboard-response", id, result: { ok: false, error: "Extension disconnected. Reload it, then reopen the dashboard from the popup." } }, origin),
    );
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "STATE") window.postMessage({ channel: "handsfree-dashboard-state", state: message.state }, origin);
  });
  window.postMessage({ channel: "handsfree-dashboard-ready" }, origin);
}
