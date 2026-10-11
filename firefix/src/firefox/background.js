// Firefox has event pages instead of Chrome offscreen documents. Keep capture
// in an extension tab, where the user can grant camera and microphone access.
var chrome = { ...browser, runtime: { ...browser.runtime }, tabs: { ...browser.tabs }, storage: { ...browser.storage, local: { ...browser.storage.local }, session: { ...browser.storage.session } } };
// Firefox has no setAccessLevel. Keys are never returned by the website bridge.
chrome.storage.local.setAccessLevel = async () => {};
chrome.storage.session.setAccessLevel = async () => {};
const captureURL = browser.runtime.getURL("offscreen.html");
let captureCreation = null;
const captureTabIds = new Set();
const captureWaiters = new Set();
chrome.tabs.onActivated = {
  addListener(listener) {
    browser.tabs.onActivated.addListener(event => {
      // Opening the capture page is infrastructure, not a user tab switch.
      if (captureCreation || captureTabIds.has(event.tabId)) return;
      listener(event);
    });
  },
};
browser.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== "FIREFOX_CAPTURE_READY" || sender.url !== captureURL) return;
  for (const resolve of captureWaiters) resolve();
  captureWaiters.clear();
  respond({ ok: true });
});
async function captureTabs() {
  const tabs = await browser.tabs.query({});
  const captures = tabs.filter(tab => tab.url === captureURL);
  for (const tab of captures) captureTabIds.add(tab.id);
  return captures;
}
chrome.runtime.ContextType = { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" };
chrome.runtime.getContexts = async () => (await captureTabs()).map(tab => ({
  contextType: "OFFSCREEN_DOCUMENT", documentUrl: captureURL, tabId: tab.id,
}));
const handsfreeCapture = {
  Reason: { USER_MEDIA: "USER_MEDIA", WORKERS: "WORKERS", AUDIO_PLAYBACK: "AUDIO_PLAYBACK" },
  async createDocument() {
    if (captureCreation) return captureCreation;
    captureCreation = (async () => {
      if ((await captureTabs()).length) return;
      let resolveReady;
      const ready = new Promise(resolve => { resolveReady = resolve; captureWaiters.add(resolve); });
      const timeout = setTimeout(resolveReady, 15000);
      try {
        // A foreground tab permits Firefox's device permission prompt.
        const capture = await browser.tabs.create({ url: captureURL, active: true });
        captureTabIds.add(capture.id);
        await ready;
        const response = await browser.runtime.sendMessage({ type: "FIREFOX_CAPTURE_PING" });
        if (!response?.ok) throw new Error("Capture tab is not ready. Close it and start the session again.");
      } finally { clearTimeout(timeout); captureWaiters.delete(resolveReady); }
    })().finally(() => { captureCreation = null; });
    return captureCreation;
  },
  async closeDocument() {
    const tabs = await captureTabs();
    if (tabs.length) await browser.tabs.remove(tabs.map(tab => tab.id));
  },
};
const firefoxURLs = { "chrome://downloads/": "about:downloads", "chrome://history/": "about:history", "chrome://settings/": "about:preferences" };
chrome.tabs.create = options => browser.tabs.create({ ...options, ...(firefoxURLs[options.url] ? { url: firefoxURLs[options.url] } : {}) });
let narration = null;
const handsfreeNarration = {
  stop() { speechSynthesis.cancel(); narration = null; },
  speak(text, options, callback) {
    speechSynthesis.cancel();
    const utterance = narration = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang || "en-US";
    utterance.rate = options.rate || 1;
    utterance.onend = () => { if (narration === utterance) narration = null; options.onEvent?.({ type: "end" }); };
    utterance.onerror = event => options.onEvent?.({ type: event.error === "canceled" || event.error === "interrupted" ? "interrupted" : "error" });
    speechSynthesis.speak(utterance);
    callback?.();
  },
};
// Closing capture must stop the session rather than leave a running indicator.
browser.tabs.onRemoved.addListener(async id => {
  if (captureTabIds.delete(id) && !(await captureTabs()).length) {
    await browser.runtime.sendMessage({ type: "STOP" }).catch(() => {});
  }
});
