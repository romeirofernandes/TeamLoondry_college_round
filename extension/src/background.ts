import {
  defaults,
  initialState,
  type Message,
  type SessionState,
  type Settings,
  type Intent,
  type MetricEvent,
  type TargetText,
  type PageContext,
} from "./shared";
import { parseIntent } from "./core/parser";
import { bundledProviders } from "./provider-config";
import { mapCommand, resolveArbitrary, transcribeAudio } from "./providers";
import { rankTabs, adjacentTabId } from "./core/ranking";
import { appendMetric, summarizeMetrics } from "./core/metrics";

let state: SessionState = { ...initialState };
let settings: Settings = { ...defaults };
let pageRevision = 0;
let controllerTabId: number | null = null;
let providers: { groqKeys?: string[]; jevKey?: string } = {};
let dashboardTabs = new Set<number>();
let creatingOffscreen: Promise<void> | null = null;
let lastBroadcast = 0;
const dashboardMessages = new Set(["GET_STATE", "GET_SETTINGS", "SAVE_SETTINGS", "START", "PAUSE", "RESUME", "STOP", "RECALIBRATE", "HEARD", "ACTION", "GET_LOGS", "CLEAR_LOGS", "METRIC", "GET_PROVIDER_STATUS", "SAVE_PROVIDERS", "SET_DASHBOARD_URL", "GRANT_PERMISSIONS", "INSTALL_SPEECH_PACK", "GET_TABS", "ACTIVATE_TAB"]);
const keyIndexStore = {
  async get(): Promise<number> { const value = (await chrome.storage.local.get("groqKeyIndex")).groqKeyIndex; return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0; },
  async set(next: number) { await chrome.storage.local.set({ groqKeyIndex: next }); },
};
function groqOptions() { return { groqKeys: (providers.groqKeys ?? bundledProviders.groqKeys).slice(0, 4), groqModel: "qwen/qwen3.8-27b", keyIndexStore }; }
function jevOptions() { return { jevKey: providers.jevKey ?? bundledProviders.jevKey, jevProvider: settings.jevProvider, language: settings.language }; }
function isDashboard(url?: string) {
  try { const candidate = new URL(url || ""); const configured = new URL(settings.dashboardUrl); return candidate.origin === configured.origin && candidate.pathname === configured.pathname; } catch { return false; }
}
let pendingClose: { id: number; expires: number } | null = null;
let tabChoices: number[] = [];
const tabActivations = new Map<number, symbol>();
let lastTrackingLog = 0;
let hadTracking = false;
let logs: MetricEvent[] = [];
let logsTimer: ReturnType<typeof setTimeout> | undefined;
const ready = (async () => {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  const local = await chrome.storage.local.get(["settings", "logs", "providers", "speechPreferenceVersion"]);
  settings = { ...defaults, ...((local.settings as Partial<Settings>) ?? {}) };
  if (local.speechPreferenceVersion !== 2) settings.speechMode = "browser";
  settings.groqModel = "qwen/qwen3.8-27b";
  providers = local.providers ?? {};
  logs = (local.logs as MetricEvent[]) ?? [];
  const saved = await chrome.storage.session.get(["state", "dashboardTabs"]);
  if (saved.state)
    state = { ...initialState, ...(saved.state as Partial<SessionState>) };
  dashboardTabs = new Set(Array.isArray(saved.dashboardTabs) ? saved.dashboardTabs.filter((id): id is number => typeof id === "number" && Number.isInteger(id)) : []);
  // A restarted worker must not restore a pending confirmation.
})();
function uiSender(sender: chrome.runtime.MessageSender) {
  return !sender.tab || sender.url?.startsWith(chrome.runtime.getURL(""));
}
function record(type: string, value?: number) {
  logs = appendMetric(logs, { at: Date.now(), type, value });
  if (!logsTimer)
    logsTimer = setTimeout(() => {
      logsTimer = undefined;
      void chrome.storage.local.set({ logs });
    }, 250);
}
async function publish(patch: Partial<SessionState>, persist = true) {
  state = { ...state, ...patch };
  if (persist) await chrome.storage.session.set({ state, dashboardTabs: [...dashboardTabs] });
  const now = Date.now();
  if (!persist && now - lastBroadcast < 250) return;
  lastBroadcast = now;
  void chrome.runtime.sendMessage({ type: "STATE", state }).catch(() => {});
  for (const id of dashboardTabs) void chrome.tabs.sendMessage(id, { type: "STATE", state }).catch(() => {});
}
async function page(message: Message, tabId = state.targetTabId): Promise<any> {
  if (tabId === null)
    return { ok: false, error: "Open a supported webpage first." };
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return {
      ok: false,
      error:
        "This page is unavailable. Grant webpage access in controls, or reload the page.",
    };
  }
}
function pageSettings() {
  return { ...settings, llmKey: "" };
}
async function pageState(tabId = state.targetTabId) {
  return page(
    {
      type: "PAGE_STATE",
      running: state.running,
      paused: state.paused,
      dictating: state.dictating,
      settings: pageSettings(),
    },
    tabId,
  );
}
function supported(url?: string) {
  return (
    !!url &&
    /^https?:\/\//.test(url) &&
    !/^https:\/\/(chromewebstore.google.com|chrome.google.com\/webstore)/.test(
      url,
    )
  );
}
async function attach(tabId: number) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!supported(tab.url)) {
      await publish({
        feedback:
          "This is a protected browser page. Handsfree controls supported HTTP or HTTPS webpages only.",
      });
      return false;
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    await pageState(tabId);
    return true;
  } catch {
    await publish({
      feedback:
        "Allow webpage access in controls, then return to this tab. Protected pages cannot be controlled.",
    });
    return false;
  }
}
async function target(tabId: number) {
  activeProvider?.abort();
  pageRevision++;
  if (state.targetTabId !== null && state.targetTabId !== tabId)
    await page({
      type: "PAGE_STATE",
      running: false,
      paused: true,
      dictating: false,
      settings: pageSettings(),
    });
  pendingClose = null;
  tabChoices = [];
  await publish({ targetTabId: tabId, dictating: false, confidence: 0 });
  await attach(tabId);
}
async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT], documentUrls: [chrome.runtime.getURL("offscreen.html")] });
  if (contexts.length) return;
  if (!creatingOffscreen) creatingOffscreen = chrome.offscreen.createDocument({ url: "offscreen.html", reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.WORKERS], justification: "Keep camera tracking and microphone recognition responsive while browsing other tabs." }).finally(() => { creatingOffscreen = null; });
  await creatingOffscreen;
}
async function controller(command: "start" | "stop" | "pause" | "resume" | "calibrate" | "settings") {
  if (command === "start") await ensureOffscreen();
  if (command !== "start") {
    const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
    if (!contexts.length) return;
  }
  await chrome.runtime.sendMessage({ type: "OFFSCREEN_COMMAND", command, settings: pageSettings() }).catch(() => {});
}
async function stop() {
  activeProvider?.abort();
  pageRevision++;
  pendingClose = null;
  tabChoices = [];
  record("run-stop");
  await publish({
    running: false,
    paused: false,
    dictating: false,
    confidence: 0,
    camera: "Off",
    voice: "Off",
    trackingBackend: "Not started",
    interimTranscript: "",
    calibrationProgress: null,
    calibrationStage: "",
    fps: 0,
    latencyMs: 0,
    feedback: "Stopped. Camera and microphone are released.",
  });
  await pageState();
  await controller("stop");
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  if (contexts.length) await chrome.offscreen.closeDocument();
  await chrome.storage.local.set({ logs });
}
async function pause() {
  activeProvider?.abort();
  pageRevision++;
  pendingClose = null;
  tabChoices = [];
  record("pause");
  await publish({
    paused: true,
    dictating: false,
    confidence: 0,
    voice: "Paused",
    feedback: "Paused. Pointing, voice, and dictation are stopped.",
  });
  await pageState();
  await controller("pause");
}
async function resume() {
  if (!state.running) return;
  await publish({
    paused: false,
    confidence: 0,
    feedback: "Resumed. Choose your next target.",
  });
  await pageState();
  await controller("resume");
}
async function connectDashboard(tabId: number) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isDashboard(tab.url)) return;
    dashboardTabs.add(tabId);
    await chrome.storage.session.set({ dashboardTabs: [...dashboardTabs] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["dashboard-bridge.js"] });
    void chrome.tabs.sendMessage(tabId, { type: "STATE", state }).catch(() => {});
  } catch { /* The popup explains missing website access. */ }
}
async function openController(tabId?: number, hash = "#overview") {
  if (tabId !== undefined && !dashboardTabs.has(tabId)) await target(tabId);
  const url = new URL(settings.dashboardUrl);
  url.hash = /^#[a-z-]+$/.test(hash) ? hash : "#overview";
  const existing = (await chrome.tabs.query({})).find(tab => isDashboard(tab.url));
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true, url: url.href });
    await chrome.windows.update(existing.windowId, { focused: true });
    await connectDashboard(existing.id);
  } else {
    const tab = await chrome.tabs.create({ url: url.href });
    if (tab.id !== undefined) { dashboardTabs.add(tab.id); await chrome.storage.session.set({ dashboardTabs: [...dashboardTabs] }); }
  }
  return { ok: true };
}
async function openPermissions() {
  await chrome.windows.create({ url: chrome.runtime.getURL("permissions.html"), type: "popup", width: 490, height: 620 });
  return { ok: true, opened: true };
}
async function needTabs() {
  if (await chrome.permissions.contains({ permissions: ["tabs"] }))
    return false;
  await publish({
    feedback:
      "Enable tab commands in the control window first. Chrome requires a button press to grant tab access.",
  });
  return true;
}
async function tabAction(intent: Intent, current: () => boolean) {
  if (await needTabs() || !current()) return;
  const tabs = await chrome.tabs.query({});
  if (!current()) return;
  const browse = tabs.filter(
    (t) => !dashboardTabs.has(t.id ?? -1) && t.id !== controllerTabId && t.id !== undefined,
  );
  switch (intent.type) {
    case "new-tab":
      await chrome.tabs.create({ url: "about:blank" });
      break;
    case "search":
      await chrome.tabs.create({
        url:
          "https://www.google.com/search?q=" + encodeURIComponent(intent.query),
        active: !intent.background,
      });
      break;
    case "next-tab":
    case "previous-tab": {
      const currentTab = browse.find((t) => t.id === state.targetTabId);
      const group = browse.filter((t) => t.windowId === currentTab?.windowId);
      const id = adjacentTabId(
        group as any,
        state.targetTabId ?? -1,
        intent.type === "next-tab" ? "next" : "previous",
      );
      if (id != null) await activateTab(id, current);
      break;
    }
    case "named-tab": {
      const matches = rankTabs(intent.name, browse as any);
      if (matches.kind === "none")
        await publish({ feedback: "No tab title matches. Nothing changed." });
      else if (matches.kind === "tie") {
        tabChoices = matches.ids.map(Number);
        await publish({
          feedback:
            "Choose a tab: " +
            tabChoices
              .map(
                (id, i) =>
                  i + 1 + ". " + browse.find((t) => t.id === id)?.title,
              )
              .join("; ") +
            ". Say choose one, choose two, or cancel.",
        });
      } else await activateTab(Number(matches.ids[0]), current);
      break;
    }
    case "close-tab":
      if (state.targetTabId === null) break;
      pendingClose = { id: state.targetTabId, expires: Date.now() + 10000 };
      await publish({
        feedback: "Close this tab? Say confirm within 10 seconds, or cancel.",
      });
      record("confirmation-request");
      break;
    case "incognito": {
      const allowed = await chrome.extension.isAllowedIncognitoAccess();
      if (!current()) return;
      if (allowed)
        await chrome.windows.create({ incognito: true });
      else
        await publish({
          feedback:
            "Allow incognito access in chrome://extensions → Handsfree details first.",
        });
      break;
    }
    case "history":
    case "downloads":
    case "settings":
      await chrome.tabs.create({ url: "chrome://" + intent.type + "/" });
      break;
  }
}
async function activateTab(id: number, current: () => boolean = () => true) {
  const revision = pageRevision;
  const valid = () => current() && pageRevision === revision;
  const tab = await chrome.tabs.get(id);
  if (!valid()) return;
  const activation = Symbol();
  tabActivations.set(id, activation);
  try {
    await chrome.tabs.update(id, { active: true });
    if (!valid()) return;
    await chrome.windows.update(tab.windowId, { focused: true });
    if (!valid()) return;
    // target() deliberately changes the revision and aborts the provider. After
    // committing our own transition, only another revision can supersede it.
    const targetRevision = pageRevision + 1;
    await target(id);
    if (pageRevision === targetRevision && state.targetTabId === id)
      await publish({ feedback: "Switched tab." });
  } finally {
    if (tabActivations.get(id) === activation) tabActivations.delete(id);
  }
}
async function arbitraryFind(query: string, signal?: AbortSignal) {
  if (!groqOptions().groqKeys.length) { await publish({ feedback: "Add a Groq key in the website dashboard to use hey handsfree commands." }); return; }
  const requestRevision = pageRevision;
  const snapshotTab = state.targetTabId;
  const targets = await page({ type: "GET_TARGETS" });
  const chosen: TargetText[] = Array.isArray(targets) ? targets.slice(0, 1500).map(t => ({ id: String(t.id), text: String(t.text).slice(0, 160), role: String(t.role) })) : [];
  const context = await page({ type: "GET_PAGE_CONTEXT" });
  const safeContext: PageContext | undefined = context && typeof context.title === "string" && typeof context.url === "string" && typeof context.text === "string"
    ? { title: context.title.slice(0, 500), url: context.url.slice(0, 2000), text: context.text.slice(0, 12000) } : undefined;
  const current = () => !signal?.aborted && pageRevision === requestRevision && !state.paused && state.running && state.targetTabId === snapshotTab;
  if (!current()) return;
  await publish({ feedback: "Understanding your request with Groq…" });
  record("find-request");
  try {
    const result = await resolveArbitrary(query, chosen, groqOptions(), signal, safeContext);
    if (!current()) return;
    if (result.answer) {
      const response = await page({ type: "ANSWER", text: result.answer });
      if (current()) await publish({ feedback: response?.error || result.answer });
      return;
    }
    if (result.intent) { await action(result.intent, current); return; }
    let ids = result.ids;
    if (ids.length === 1) {
      const selected = chosen.find(target => target.id === ids[0]);
      const label = selected?.text.toLowerCase().replace(/\s+/g, " ").trim();
      if (label) ids = chosen.filter(target => target.role === selected?.role && target.text.toLowerCase().replace(/\s+/g, " ").trim() === label).map(target => target.id);
    }
    const response = await page({ type: "FIND_RESULT", ids: ids.slice(0, 10) });
    if (current() && response?.error) await publish({ feedback: response.error });
    record(ids.length ? "find-match" : "find-no-match");
  } catch (error) {
    if (current()) await publish({ feedback: error instanceof Error ? error.message : "Groq failed. Check your connection and retry." });
    record("find-error");
  }
}
async function action(intent: Intent, current: () => boolean = () => true) {
  if (!current()) return;
  if (intent.type === "stop") {
    await stop();
    return;
  }
  if (intent.type === "pause") {
    await pause();
    return;
  }
  if (intent.type === "resume") {
    await resume();
    return;
  }
  if (!state.running || state.paused) return;
  record(intent.type === "unknown" ? "command-unknown" : "command-recognized");
  record("command-" + intent.type);
  if (intent.type === "unknown") {
    await publish({
      feedback:
        'Heard "' + intent.heard + '". No command matched; nothing happened.',
    });
    return;
  }
  if (intent.type === "cancel") {
    pendingClose = null;
    tabChoices = [];
    await page({ type: "PAGE_ACTION", intent });
    await publish({ feedback: "Cancelled." });
    return;
  }
  if (intent.type === "confirm" && pendingClose) {
    const pending = pendingClose;
    pendingClose = null;
    if (pending.expires < Date.now() || pending.id !== state.targetTabId) {
      await publish({
        feedback:
          "Confirmation expired or the target tab changed. Nothing closed.",
      });
      return;
    }
    await chrome.tabs.remove(pending.id);
    record("tab-close");
    return;
  }
  if (intent.type === "choose" && tabChoices.length) {
    const id = tabChoices[intent.index - 1];
    if (id === undefined) {
      await publish({ feedback: "That tab choice is unavailable." });
      return;
    }
    tabChoices = [];
    await activateTab(id, current);
    return;
  }
  pendingClose = null;
  if (
    [
      "new-tab",
      "search",
      "next-tab",
      "previous-tab",
      "named-tab",
      "close-tab",
      "incognito",
      "history",
      "downloads",
      "settings",
    ].includes(intent.type)
  ) {
    await tabAction(intent, current);
    return;
  }
  if (intent.type === "find") {
    await providerWork(signal => arbitraryFind(intent.query, signal));
    return;
  }
  const result = await page({ type: "PAGE_ACTION", intent });
  if (typeof result?.dictating === "boolean")
    await publish({ dictating: result.dictating });
  if (result?.error) await publish({ feedback: result.error });
}
let commandQueue = Promise.resolve();
let urgentCommand = Promise.resolve();
let activeProvider: AbortController | null = null;
let pendingTypingCommands = 0;

/** Release the speech queue on cancellation even if a transport ignores abort. */
async function providerWork(work: (signal: AbortSignal) => Promise<void>) {
  const controller = new AbortController();
  activeProvider = controller;
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
  let cancelled: (() => void) | undefined;
  const cancellation = new Promise<void>(resolve => {
    cancelled = () => resolve();
    signal.addEventListener("abort", cancelled, { once: true });
  });
  try { await Promise.race([work(signal), cancellation]); }
  finally {
    if (cancelled) signal.removeEventListener("abort", cancelled);
    if (activeProvider === controller) activeProvider = null;
  }
}
async function routeHeard(text: string, parsed: Intent, revision: number) {
  if (revision !== pageRevision || !state.running || state.paused) return;
  await publish({ lastHeard: text, interimTranscript: "" });
  if (revision !== pageRevision || !state.running || state.paused) return;
  if (state.dictating && parsed.type !== "stop-typing") {
    const result = await page({ type: "DICTATE", text });
    if (result?.error) await publish({ feedback: result.error });
    return;
  }
  const wake = /^hey[\s,]+hands[\s-]*free[\s,:.!-]+(.+)$/i.exec(text.trim());
  if (wake) { await providerWork(signal => arbitraryFind(wake[1], signal)); return; }
  if (parsed.type !== "unknown" && parsed.type !== "find") { await action(parsed); return; }
  await providerWork(async signal => {
    const intent = await mapCommand(text, jevOptions(), signal);
    if (signal.aborted || revision !== pageRevision || !state.running || state.paused) return;
    await action(intent, () => !signal.aborted && revision === pageRevision && state.running && !state.paused);
  });
}
async function handle(message: Message, sender: chrome.runtime.MessageSender) {
  await ready;
  const internal = uiSender(sender);
  const dashboardCandidate = sender.tab?.id !== undefined && dashboardTabs.has(sender.tab.id);
  let dashboard = false;
  if (dashboardCandidate) {
    try { dashboard = isDashboard(sender.url) && isDashboard((await chrome.tabs.get(sender.tab!.id!)).url); } catch { /* Closed or navigated dashboard. */ }
    if (!dashboard) return { ok: false, error: "Reopen the configured Handsfree dashboard from the popup." };
  }
  const trusted = internal || dashboard;
  if (dashboard && !dashboardMessages.has(message.type)) return { ok: false, error: "This action is not available to the dashboard." };
  if (!trusted && sender.tab?.id !== state.targetTabId)
    return { ok: false, error: "Inactive page." };
  if (!trusted && !["SET_STATE", "METRIC", "PAUSE"].includes(message.type))
    return {
      ok: false,
      error: "This message is reserved for extension controls.",
    };
  switch (message.type) {
    case "GET_STATE":
      return state;
    case "GET_SETTINGS":
      return pageSettings();
    case "GET_PROVIDER_STATUS":
      return { groqKeyCount: groqOptions().groqKeys.length, jevConfigured: !!jevOptions().jevKey, activeProvider: jevOptions().jevKey ? "Jev via " + settings.jevProvider : null, sharedKeys: !providers.groqKeys && bundledProviders.groqKeys.length > 0 };
    case "SAVE_PROVIDERS":
      if (message.groqKeys !== undefined) providers.groqKeys = message.groqKeys.map(key => String(key).trim()).filter(Boolean).slice(0, 4);
      if (message.jevKey !== undefined) providers.jevKey = String(message.jevKey).trim();
      await chrome.storage.local.set({ providers });
      return { ok: true };
    case "GET_CALIBRATION":
      return (await chrome.storage.local.get(`calibration-${message.mode}`))[`calibration-${message.mode}`];
    case "SAVE_CALIBRATION":
      await chrome.storage.local.set({ [`calibration-${message.mode}`]: message.calibration });
      return { ok: true };
    case "TRANSCRIBE_AUDIO": {
      if (!state.running || state.paused || settings.speechMode !== "browser") return { ok: false, error: "Voice session is paused." };
      if (!Array.isArray(message.audio) || message.audio.length > 2000000 || !/^audio\/(webm|ogg|mp4)/.test(message.mime)) return { ok: false, error: "Invalid microphone recording." };
      const revision = pageRevision;
      const text = await transcribeAudio(new Blob([new Uint8Array(message.audio)], { type: message.mime }), { ...groqOptions(), language: settings.language }, AbortSignal.timeout(12000));
      return { text: revision === pageRevision && state.running && !state.paused ? text : "" };
    }
    case "TRANSCRIPT":
      if (state.running && !state.paused) {
        await publish(message.final ? { lastHeard: message.text, interimTranscript: "" } : { interimTranscript: message.text }, message.final);
        await page(message);
      }
      return { ok: true };
    case "GET_TABS":
      if (await needTabs()) return [];
      return (await chrome.tabs.query({})).filter(tab => tab.id !== undefined && !dashboardTabs.has(tab.id)).map(tab => ({ id: tab.id, title: tab.title || "Untitled tab", url: tab.url || "", active: tab.id === state.targetTabId }));
    case "ACTIVATE_TAB":
      if (await needTabs()) return { ok: false, error: "Enable tab access from the popup permission setup." };
      await activateTab(message.id);
      return { ok: true };
    case "GRANT_PERMISSIONS":
    case "INSTALL_SPEECH_PACK":
      return openPermissions();
    case "SET_DASHBOARD_URL": {
      const url = new URL(message.url);
      if (!(url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return { ok: false, error: "Use an HTTPS dashboard URL or localhost for development." };
      const permitted = await chrome.permissions.contains({ origins: [url.origin + "/*"] });
      if (!permitted) return { ok: false, error: "Enable webpage access in permission setup before using this dashboard URL." };
      if (settings.dashboardUrl !== url.href) dashboardTabs.clear();
      settings.dashboardUrl = url.href;
      await chrome.storage.local.set({ settings });
      return { ok: true };
    }
    case "SAVE_SETTINGS": {
      const next = message.settings;
      settings = {
        ...defaults,
        ...next,
        llmKey: "",
        groqModel: "qwen/qwen3.8-27b",
        jevProvider: next.jevProvider === "typesafe" ? "typesafe" : "openrouter",
        language: next.language === "auto" || /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(next.language) ? next.language : "en-US",
        dashboardUrl: settings.dashboardUrl,
        sensitivity: Math.max(0.2, Math.min(3, Number(next.sensitivity) || 1)),
        dwellMs: Math.max(400, Math.min(2500, Number(next.dwellMs) || 800)),
        confidenceThreshold: Math.max(
          0.5,
          Math.min(0.95, Number(next.confidenceThreshold) || 0.7),
        ),
        speechMode: next.speechMode === "browser" ? "browser" : "local",
        pointerMode: next.pointerMode === "hand" ? "hand" : "face",
        llmModel: String(next.llmModel || defaults.llmModel).slice(0, 80),
      };
      await chrome.storage.local.set({ settings, speechPreferenceVersion: 2 });
      await pageState();
      await controller("settings");
      return { ok: true };
    }
    case "OPEN_CONTROLLER":
      return openController(message.tabId);
    case "OPEN_DASHBOARD":
      return openController(message.tabId, message.hash);
    case "START":
      activeProvider?.abort();
      pageRevision++;
      if (message.tabId !== undefined && !isDashboard((await chrome.tabs.get(message.tabId)).url)) await target(message.tabId);
      if (state.targetTabId === null) {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const selected = tabs.find(tab => supported(tab.url) && !isDashboard(tab.url));
        if (selected?.id !== undefined) await target(selected.id);
      }
      if (!state.running) record("run-start");
      await publish({
        running: true,
        paused: false,
        dictating: false,
        feedback: "Ready. Calibrate your pointer, or use voice.",
      });
      await pageState();
      if (state.targetTabId !== null) await attach(state.targetTabId);
      try { await controller("start"); }
      catch { await stop(); return { ok: false, error: "Capture could not start. Reload the extension, allow camera and microphone, and retry." }; }
      return { ok: true };
    case "PAUSE":
      await pause();
      return { ok: true };
    case "RESUME":
      await resume();
      return { ok: true };
    case "STOP":
      await stop();
      return { ok: true };
    case "RECALIBRATE":
      await controller("calibrate");
      return { ok: true };
    case "SET_STATE": {
      const patch = trusted
        ? message.patch
        : {
            feedback: message.patch.feedback,
            dictating: message.patch.dictating,
          };
      await publish(
        Object.fromEntries(
          Object.entries(patch).filter(([, v]) => v !== undefined),
        ) as Partial<SessionState>,
        Object.keys(patch).some(
          (key) => !["confidence", "fps", "latencyMs", "calibrationProgress", "calibrationStage"].includes(key),
        ),
      );
      return { ok: true };
    }
    case "POINTER":
      if (state.running && !state.paused) {
        const sample = message.sample;
        if (sample.confidence === 0 && hadTracking) record("tracking-loss");
        hadTracking = sample.confidence > 0;
        if (Date.now() - lastTrackingLog > 1000) {
          record("fps", sample.fps);
          record("latency", sample.latencyMs);
          lastTrackingLog = Date.now();
        }
        await page(message);
        await publish(
          {
            confidence: sample.confidence,
            fps: sample.fps,
            latencyMs: sample.latencyMs,
          },
          false,
        );
      }
      return { ok: true };
    case "HEARD": {
      if (!state.running || state.paused) return { ok: true };
      const revision = pageRevision;
      const intent = parseIntent(message.text);
      // Typing transitions remain serialized. A click can cancel slow provider
      // work only when no earlier transcript may enter or leave dictation.
      if (
        activeProvider && !state.dictating && pendingTypingCommands === 0 &&
        ["click", "open", "click-target", "pause", "stop", "cancel"].includes(intent.type)
      ) {
        const provider = activeProvider;
        urgentCommand = urgentCommand.then(() => routeHeard(message.text, intent, revision));
        provider.abort();
        await urgentCommand;
        return { ok: true };
      }
      const typing = intent.type === "start-typing" || intent.type === "stop-typing";
      if (typing) pendingTypingCommands++;
      commandQueue = commandQueue
        .then(async () => { await urgentCommand; await routeHeard(message.text, intent, revision); })
        .catch(async error => {
          if (revision === pageRevision && state.running && !state.paused)
            await publish({ feedback: error instanceof Error ? error.message : "Command failed." });
        })
        .finally(() => { if (typing) pendingTypingCommands--; });
      await commandQueue;
      return { ok: true };
    }
    case "ACTION":
      activeProvider?.abort();
      await action(message.intent);
      return { ok: true };
    case "METRIC":
      record(message.event.type, message.event.value);
      return { ok: true };
    case "GET_LOGS":
      return { events: logs, summary: summarizeMetrics(logs) };
    case "CLEAR_LOGS":
      logs = [];
      await chrome.storage.local.set({ logs });
      return { ok: true };
    default:
      return { ok: false };
  }
}
chrome.runtime.onMessage.addListener((message: Message, sender, respond) => {
  if (message?.type === "STATE" || message?.type === "CONTROLLER_COMMAND" || message?.type === "OFFSCREEN_COMMAND")
    return;
  void handle(message, sender)
    .then(respond)
    .catch(() =>
      respond({
        ok: false,
        error: "The action failed. Check permissions and retry.",
      }),
    );
  return true;
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  void ready.then(async () => {
    // Controlled activation commits its target once, after focus completes.
    // Do not let Chrome's echo event cancel that same in-flight action.
    if (tabActivations.has(tabId) || tabId === state.targetTabId) return;
    const tab = await chrome.tabs.get(tabId);
    if (isDashboard(tab.url)) { await connectDashboard(tabId); return; }
    if (!state.running || tabId === controllerTabId || tab.url?.startsWith(chrome.runtime.getURL(""))) return;
    await target(tabId);
  });
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  void ready.then(async () => {
    if (change.status === "complete") await connectDashboard(tabId);
    if (tabId !== state.targetTabId) return;
    if (change.status === "loading") {
      activeProvider?.abort();
      pageRevision++;
      pendingClose = null;
      tabChoices = [];
      await publish({ dictating: false, confidence: 0 });
    }
    if (change.status === "complete" && state.running) await attach(tabId);
  });
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void ready.then(async () => {
    dashboardTabs.delete(tabId);
    await chrome.storage.session.set({ dashboardTabs: [...dashboardTabs] });
    if (tabId === state.targetTabId) {
      activeProvider?.abort();
      pageRevision++;
      pendingClose = null;
      await publish({ targetTabId: null, dictating: false, confidence: 0 });
    }
  });
});
chrome.commands.onCommand.addListener((command) => {
  if (command === "pause-handsfree")
    void ready.then(() => (state.paused ? resume() : pause()));
});
