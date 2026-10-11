// Loaded after offscreen.js, once its command listener is registered.
browser.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type === "FIREFOX_CAPTURE_PING") respond({ ok: true });
});
void browser.runtime.sendMessage({ type: "FIREFOX_CAPTURE_READY" });
document.querySelector("#stop-capture").addEventListener("click", () => {
  void browser.runtime.sendMessage({ type: "STOP" });
});
