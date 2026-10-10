import {claimDesktop,releaseDesktop,connectDesktop,disconnectDesktop,paired,onDesktopLost} from "./desktop";
import {uploadFile} from "./file-upload";
import { parseSite, siteCandidates, unsafeSpeech, isCancellation } from "./sites/language";
import { siteHomes } from "./sites/catalogue";
import type { SiteResult, SiteSnapshot } from "./sites/types";
import {
  defaults,
  normalizeControlSettings,
  inputMethods,
  initialState,
  type Message,
  type SessionState,
  type Settings,
  type Intent,
  type MetricEvent,
  type TargetText,
  type PageContext,
} from "./shared";
import { parseIntent, sessionIntent, wakeRequest } from "./core/parser";
import { mediaControl } from "./content/media";
import { bundledProviders } from "./provider-config";
import { rankTabs, rankTargets, adjacentTabId } from "./core/ranking";
import { mapCommand, resolveArbitrary, transcribeAudio, jevKeys } from "./providers";
import { appendMetric, summarizeMetrics } from "./core/metrics";
import { normalizeGesturePresets } from "./gestures";
import type { GesturePreset, GestureRuntimeStatus } from "./shared";

let state: SessionState = { ...initialState };
let settings: Settings = { ...defaults };
let pageRevision = 0;
let planToken = 0;
let planDestination: string | null = null;
let linkAuthorizationRevision = 0;
let controllerTabId: number | null = null;
let providers: { groqKeys?: string[]; jevKey?: string; jevKeys?: string[] } = {};
let dashboardTabs = new Set<number>();
let creatingOffscreen: Promise<void> | null = null;
let uiVoiceTab: number | null = null;
let uiVoiceUntil = 0;
let narrationToken = 0;
let lastBroadcast = 0;
const dashboardMessages = new Set(["GET_STATE", "GET_SETTINGS", "SAVE_SETTINGS", "START", "PAUSE", "RESUME", "STOP", "RECALIBRATE", "HEARD", "ACTION", "GET_LOGS", "CLEAR_LOGS", "METRIC", "GET_PROVIDER_STATUS", "SAVE_PROVIDERS", "SET_DASHBOARD_URL", "GRANT_PERMISSIONS", "INSTALL_SPEECH_PACK", "GET_TABS", "ACTIVATE_TAB"]);
dashboardMessages.add("GET_SITE_CONTEXT");
dashboardMessages.add("GET_PERMISSIONS");
dashboardMessages.add("REVOKE_PERMISSION");
for (const type of ["UI_VOICE", "UI_SPEAK"]) dashboardMessages.add(type);
dashboardMessages.add("GET_GESTURE_PRESETS");
dashboardMessages.add("SAVE_GESTURE_PRESETS");
dashboardMessages.add("GET_GESTURE_DESTINATIONS");
dashboardMessages.add("GET_GESTURE_STATUS");
dashboardMessages.add("CALIBRATE_GESTURE");
dashboardMessages.add("CANCEL_GESTURE_CALIBRATION");
dashboardMessages.add("GET_GESTURE_PREVIEW");
let wakeUntil = 0;
let mediaPermissions: { camera: "granted" | "denied" | "prompt" | "unknown"; microphone: "granted" | "denied" | "prompt" | "unknown" } = { camera: "unknown", microphone: "unknown" };
let gestureRuntimeStatus: GestureRuntimeStatus = { ready: false, detected: null, confidence: 0 };
let gesturePreviewFrame: string | null = null;
const keyIndexStore = {
  async get(): Promise<number> { const value = (await chrome.storage.local.get("groqKeyIndex")).groqKeyIndex; return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0; },
  async set(next: number) { await chrome.storage.local.set({ groqKeyIndex: next }); },
};
function groqOptions() { return { groqKeys: (providers.groqKeys ?? bundledProviders.groqKeys).slice(0, 4), groqModel: "qwen/qwen3.8-27b", keyIndexStore }; }
const jevKeyIndexStore = {
  async get(): Promise<number> { const value = (await chrome.storage.local.get("jevKeyIndex")).jevKeyIndex; return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0; },
  async set(next: number) { await chrome.storage.local.set({ jevKeyIndex: next }); },
};
function jevOptions() {
  const configured = providers.jevKey !== undefined || providers.jevKeys !== undefined ? providers : bundledProviders;
  return { jevKey: configured.jevKey ?? "", jevKeys: configured.jevKeys ?? [], jevKeyIndexStore, jevProvider: settings.jevProvider, language: settings.language };
}
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
  settings = normalizeControlSettings((local.settings as Partial<Settings>) ?? {});
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
  const oldFeedback = state.feedback;
  state = { ...state, ...patch };
  if (patch.feedback && patch.feedback !== oldFeedback && settings.spokenFeedback)
    void chrome.runtime.sendMessage({ type: "SPEAK_FEEDBACK", text: patch.feedback.slice(0,1200), enabled: true }).catch(() => {});
  if (persist) await chrome.storage.session.set({ state: { ...state, calibrationSnapshots: {} }, dashboardTabs: [...dashboardTabs] });
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
  ++planToken; planDestination=null;
  wakeUntil = 0;
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
  if (!creatingOffscreen) creatingOffscreen = chrome.offscreen.createDocument({ url: "offscreen.html", reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.WORKERS, chrome.offscreen.Reason.AUDIO_PLAYBACK], justification: "Keep camera tracking and microphone recognition responsive while browsing other tabs." }).finally(() => { creatingOffscreen = null; });
  await creatingOffscreen;
}
let captureRevision=0;
async function controller(command: Extract<Message, {type: "OFFSCREEN_COMMAND"}>["command"], options: { gesture?: import("./shared").HandGesture; presets?: GesturePreset[] } = {}) {
  if (command === "start" || command === "ui-start") {
    const revision=captureRevision;await claimDesktop();
    if(revision!==captureRevision||command==="start"&&!state.running)throw new Error("Capture start cancelled");
    await ensureOffscreen();
    if(revision!==captureRevision||command==="start"&&!state.running){const contexts=await chrome.runtime.getContexts({contextTypes:[chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]});if(contexts.length&&!state.running)await chrome.offscreen.closeDocument();throw new Error("Capture start cancelled");}
  }
  if (command !== "start" && command !== "ui-start") {
    const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
    if (!contexts.length) return;
  }
  await chrome.runtime.sendMessage({ type: "OFFSCREEN_COMMAND", command, settings: pageSettings(), ...options }).catch(() => {});
}
async function stop() {
  captureRevision++;
  uiVoiceTab = null; uiVoiceUntil = 0; ++narrationToken; chrome.tts?.stop();
  ++planToken; planDestination=null;
  wakeUntil = 0;
  activeProvider?.abort();
  pageRevision++;
  pendingClose = null;
  tabChoices = [];
  gesturePreviewFrame = null;
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
    calibrationSnapshots: {},
    fps: 0,
    latencyMs: 0,
    feedback: "Stopped. Camera and microphone are released.",
  });
  await pageState();
  await controller("stop");
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  if (contexts.length) await chrome.offscreen.closeDocument();
  await releaseDesktop();
  await chrome.storage.local.set({ logs });
}
async function pause() {
  ++planToken; planDestination=null;
  wakeUntil = 0;
  activeProvider?.abort();
  pageRevision++;
  pendingClose = null;
  tabChoices = [];
  gesturePreviewFrame = null;
  record("pause");
  await publish({
    paused: true,
    dictating: false,
    confidence: 0,
    voice: "Listening for resume",
    interimTranscript: "",
    feedback: `Paused. Say "${settings.resumePhrase}" to resume. Only session controls are accepted.`,
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
async function openPermissions(options?: Extract<Message, {type: "GRANT_PERMISSIONS"}>, speech = false) {
  const url = new URL(chrome.runtime.getURL("permissions.html"));
  url.searchParams.set("kind", speech ? "speech" : options?.kind ?? "devices");
  url.searchParams.set("camera", String(options?.camera ?? !settings.voiceOnly));
  url.searchParams.set("microphone", String(options?.microphone ?? inputMethods(settings).includes("voice")));
  url.searchParams.set("return", options?.returnHash === "#setup" ? "#setup" : "#preferences");
  const existing = (await chrome.tabs.query({})).find(tab => tab.url?.startsWith(chrome.runtime.getURL("permissions.html")));
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { url: url.href, active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else await chrome.windows.create({ url: url.href, type: "popup", width: 540, height: 740 });
  return { ok: true, opened: true };
}
async function activeDashboard(id: number): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(id);
    return !!tab.active && isDashboard(tab.url) && (await chrome.windows.get(tab.windowId)).focused;
  } catch { return false; }
}
async function speakUI(text: string) {
  const token = ++narrationToken;
  chrome.tts.stop();
  if (!text.trim()) { await controller("narration-end"); return {ok:true}; }
  await controller("narration-start");
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { if (token === narrationToken) chrome.tts.stop(); resolve(); }, 18000);
      chrome.tts.speak(text.slice(0, 1200), {
        lang: settings.language === "auto" ? "en-US" : settings.language, rate: 1,
        onEvent(event) {
          if (["end", "interrupted", "cancelled", "error"].includes(event.type)) {
            clearTimeout(timer);
            if (event.type === "error") reject(new Error("Spoken guidance is unavailable. Use your screen reader or choose Read aloud to retry."));
            else resolve();
          }
        },
      }, () => { if (chrome.runtime.lastError) { clearTimeout(timer); reject(new Error("Spoken guidance is unavailable. Use your screen reader or retry.")); } });
    });
  } finally { if (token === narrationToken) await controller("narration-end"); }
  return {ok:true};
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
    case "show-tabs": {
      const currentTab = browse.find((t) => t.id === state.targetTabId);
      if (!currentTab) {
        await publish({ feedback: "There is no active browser tab to list." });
        break;
      }
      const windowTabs = browse
        .filter((t) => t.windowId === currentTab.windowId)
        .sort((a, b) => a.index - b.index);
      await publish({
        feedback:
          "Tabs in this window: " +
          windowTabs
            .map((tab, index) => `${index + 1}. ${(tab.title || "Untitled tab").slice(0, 100)}`)
            .join("; ") +
          '. Say "go to tab" followed by its number to switch.',
      });
      break;
    }
    case "indexed-tab": {
      const currentTab = browse.find((t) => t.id === state.targetTabId);
      const windowTabs = browse
        .filter((t) => t.windowId === currentTab?.windowId)
        .sort((a, b) => a.index - b.index);
      const selected = windowTabs[intent.index - 1];
      if (!selected?.id) {
        await publish({ feedback: `There is no tab ${intent.index} in this window.` });
        break;
      }
      await activateTab(selected.id, current);
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
  const parsed = parseIntent(query);
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
    const snapshot: SiteSnapshot | null = await page({type:"GET_SITE_CONTEXT"});
    if(!current())return;
    const domainChoices = snapshot?.site ? siteCandidates(query,snapshot) : undefined;
    const result = await resolveArbitrary(query, chosen, groqOptions(), signal, safeContext, domainChoices);
    if (!current()) return;
    if (result.answer) {
      const response = await page({ type: "ANSWER", text: result.answer });
      if (current()) await publish({ feedback: response?.error || result.answer });
      return;
    }
    if (result.intent) {
      if (parsed.type === "click-target" && parsed.disposition && result.intent.type === "click-target")
        result.intent.disposition = parsed.disposition;
      if (parsed.type === "click-link" && parsed.disposition && result.intent.type === "click-link")
        result.intent.disposition = parsed.disposition;
      await action(result.intent, current); return;
    }
    let ids = result.ids;
    if (ids.length === 1) {
      const selected = chosen.find(target => target.id === ids[0]);
      const label = selected?.text.toLowerCase().replace(/\s+/g, " ").trim();
      if (label) ids = chosen.filter(target => target.role === selected?.role && target.text.toLowerCase().replace(/\s+/g, " ").trim() === label).map(target => target.id);
    }
    const requested = parseIntent(query);
    const disposition = requested.type === "click-link" || requested.type === "click-target" ? requested.disposition : undefined;
    const response = await page({ type: "FIND_RESULT", ids: ids.slice(0, 10), disposition });
    if (current() && response?.error) await publish({ feedback: response.error });
    record(ids.length ? "find-match" : "find-no-match");
  } catch (error) {
    if (current()) await publish({ feedback: error instanceof Error ? error.message : "Groq failed. Check your connection and retry." });
    record("find-error");
  }
}
async function siteResult(result: (SiteResult & {dictating?:boolean}) | null, current: () => boolean) {
  if (!result || !current()) return;
  if (typeof result.dictating === "boolean") await publish({dictating:result.dictating});
  if (result.navigate) {
    const url = new URL(result.navigate.url);
    if (!['http:','https:'].includes(url.protocol)) { await publish({feedback:'The destination is unsupported.'}); return; }
    if (result.navigate.newTab) {
      if (await needTabs() || !current()) return;
      await chrome.tabs.create({url:url.href});
    } else if (state.targetTabId !== null && current()) {
      await chrome.tabs.update(state.targetTabId,{url:url.href});
    }
  }
  if (current()) await publish({feedback:result.feedback});
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
  if (intent.type === "switch-pointer") {
    if (!inputMethods(settings).includes(intent.mode)) {
      await publish({ feedback: "Select this input in Profile and preferences first." });
      return;
    }
    if (intent.mode === settings.pointerMode) return;
    activeProvider?.abort(); pageRevision++; linkAuthorizationRevision++;
    settings = normalizeControlSettings({ ...settings, pointerMode: intent.mode });
    await chrome.storage.local.set({ settings });
    await publish({ confidence: 0, calibrationProgress: null, calibrationSnapshots: {}, feedback: `${intent.mode === "face" ? "Head" : "Hand"} pointer selected. Your saved calibration will be used.` });
    await pageState(); await controller("settings");
    return;
  }
  if (!state.running || state.paused) return;
  if(intent.type==="upload-file"){if(state.targetTabId===null)return;const tab=state.targetTabId,revision=pageRevision;try{const result=await uploadFile(tab,()=>current()&&state.running&&!state.paused&&state.targetTabId===tab&&pageRevision===revision);await publish({feedback:result});}catch(e){await publish({feedback:e instanceof Error?e.message:String(e)});}return;}
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
    ++planToken; planDestination=null;
    await page({type:"SITE_DIALOGUE",text:"cancel"});
    linkAuthorizationRevision++;
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
      "show-tabs",
      "indexed-tab",
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
  if (intent.type.startsWith("media-") && state.targetTabId !== null) {
    const tabId = state.targetTabId;
    const revision = pageRevision;
    const probes = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: mediaControl, args: [null] });
    if (!current() || pageRevision !== revision || state.paused || !state.running || state.targetTabId !== tabId) return;
    const selected = probes.filter(probe => probe.result?.found).sort((a, b) => (b.result?.score || 0) - (a.result?.score || 0))[0];
    if (selected) {
      const results = await chrome.scripting.executeScript({ target: { tabId, frameIds: [selected.frameId] }, func: mediaControl, args: [intent] });
      if (current() && pageRevision === revision && state.running && !state.paused) await publish({ feedback: results[0]?.result?.error || "Player updated." });
      return;
    }
  }
  const snapshotTab = state.targetTabId;
  const revision = pageRevision;
  const authorizationRevision = linkAuthorizationRevision;
  const stillCurrent = () => authorizationRevision === linkAuthorizationRevision && current() && state.running && !state.paused && !state.dictating && state.targetTabId === snapshotTab && pageRevision === revision;
  const result = await page({ type: "PAGE_ACTION", intent });
  if (intent.type === "site-action") { record(`site-${intent.action}`); await siteResult(result, current); return; }
  const openDisposition = intent.type === "click-link" || intent.type === "click-target" ? intent.disposition : result?.disposition;
  if (openDisposition && result?.ok && result.link && snapshotTab !== null) {
    if (!stillCurrent() || await needTabs() || !stillCurrent()) return;
    const link = result.link;
    let url: URL;
    try { url = new URL(link.url); } catch { return; }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || typeof link.id !== "string" || typeof link.pageUrl !== "string") return;
    const tab = await chrome.tabs.get(snapshotTab);
    if (!stillCurrent() || tab.url !== link.pageUrl) return;
    const valid = await page({ type: "VALIDATE_LINK", id: link.id, url: url.href, pageUrl: link.pageUrl }, snapshotTab);
    if (!stillCurrent() || valid?.ok !== true) return;
    await chrome.tabs.create({ url: url.href, active: openDisposition !== "background" });
    return;
  }
  if (typeof result?.dictating === "boolean")
    await publish({ dictating: result.dictating });
  if (result?.error) await publish({ feedback: result.error });
}
async function runGesturePreset(presetId: string) {
  if (!state.running || state.paused || typeof presetId !== "string") return;
  const stored = await chrome.storage.local.get("gesturePresets");
  const preset = normalizeGesturePresets(stored.gesturePresets).find(item => item.id === presetId && item.enabled);
  if (!preset || !state.running || state.paused) return;
  if (preset.action.type === "open-site") {
    let url: URL;
    try { url = new URL(preset.action.url); } catch { return; }
    if (!(url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) || url.username || url.password) return;
    if (preset.action.inNewTab || state.targetTabId === null) {
      const tab = await chrome.tabs.create({ url: url.href, active: true });
      if (tab.id !== undefined) await target(tab.id);
      return;
    }
    const existing = await chrome.tabs.get(state.targetTabId).catch(() => null);
    if (!existing || isDashboard(existing.url)) {
      const tab = await chrome.tabs.create({ url: url.href, active: true });
      if (tab.id !== undefined) await target(tab.id);
      return;
    }
    await chrome.tabs.update(existing.id!, { url: url.href, active: true });
    await target(existing.id!);
    return;
  }
  const intents: Record<string, Intent> = {
    "media-toggle": { type: "media-toggle" },
    "media-play": { type: "media-play" },
    "media-pause": { type: "media-pause" },
    back: { type: "back" },
    forward: { type: "forward" },
    "next-tab": { type: "next-tab" },
    "previous-tab": { type: "previous-tab" },
    "scroll-top": { type: "scroll", direction: "top" },
    "scroll-bottom": { type: "scroll", direction: "bottom" },
  };
  const intent = intents[preset.action.type];
  if (intent) await action(intent);
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
/** Bounded plans run one verified site step at a time, rebuilding context after navigation. */
async function voicePlan(steps: string[], snapshot: SiteSnapshot) {
  if(steps.length>3 || steps.some(step=>!step.trim())) { await publish({feedback:'Use at most three clear steps separated by then.'});return; }
  const token=++planToken,tabId=state.targetTabId;
  const valid=()=>planToken===token && state.running && !state.paused && state.targetTabId===tabId;
  await publish({feedback:`I will run ${steps.length} steps and stop at any choice, confirmation or failure.`});
  let completed=0;
  for(const step of steps) {
    if(!valid())return;
    const request=parseSite(step.trim(),snapshot);
    if(!request) { await publish({feedback:`Completed ${completed} steps. I could not resolve the next step. Say it separately.`});return; }
    const response: SiteResult = await page({type:'PAGE_ACTION',intent:request});
    if(!valid())return;
    if(response?.state!=='available' && response?.state!=='already-satisfied') {
      await publish({feedback:`Completed ${completed} steps. ${response?.feedback || 'The next step is unavailable.'}`});return;
    }
    if(response.navigate) {
      if(response.navigate.newTab) { await publish({feedback:`Completed ${completed} steps. Opening a new tab is not supported inside a plan. Say it separately.`});return; }
      planDestination=response.navigate.url;
      await siteResult(response,valid);
      const deadline=Date.now()+5000;
      let next: SiteSnapshot | null=null;
      while(valid() && Date.now()<deadline) {
        const candidate:SiteSnapshot|null=await page({type:'GET_SITE_CONTEXT'});
        if(candidate?.site===snapshot.site && (candidate.documentId!==snapshot.documentId || snapshot.url!==planDestination && candidate.revision>snapshot.revision) && candidate.url===planDestination) {next=candidate;break;}
        await new Promise(resolve=>setTimeout(resolve,60));
      }
      planDestination=null;
      if(!valid())return;
      if(!next) {await publish({feedback:`Completed ${completed} steps. The destination was not verified; the remaining steps were cancelled.`});return;}
      snapshot=next;
    } else {
      const next:SiteSnapshot|null=await page({type:'GET_SITE_CONTEXT'});
      if(!valid())return;
      if(!next || next.site!==snapshot.site) {await publish({feedback:'The site context changed. Remaining steps cancelled.'});return;}
      snapshot=next;
    }
    completed++; record(`site-${request.action}`);
  }
  if(valid())await publish({feedback:`Completed ${completed} verified steps.`});
}
async function routeHeard(text: string, parsed: Intent, revision: number) {
  if (revision !== pageRevision || !state.running || state.paused) return;
  await publish({ lastHeard: text, interimTranscript: "" });
  if (revision !== pageRevision || !state.running || state.paused) return;
  const conversation: SiteSnapshot | null = await page({type:"GET_SITE_CONTEXT"});
  if (revision !== pageRevision || !state.running || state.paused) return;
  if (conversation?.site === "meet" && conversation.meetingActive) {
    if (!/^(?:hey )?handsfree[, ]+/i.test(text.trim())) {
      await publish({feedback:"During a Meet call, begin each command or dictation segment with Handsfree. Use headphones to keep participant audio out of the microphone."}); return;
    }
    if (state.dictating || /^handsfree[, ]+/i.test(text.trim())) {text=text.trim().replace(/^(?:hey )?handsfree[, ]+/i, "");parsed=parseIntent(text);}
  }
  if (state.dictating && parsed.type !== "stop-typing") {
    const literal = text.toLowerCase().startsWith("literal ") ? text.slice(8) : text;
    const result = await page({ type: "DICTATE", text: literal });
    if (result?.error) await publish({ feedback: result.error });
    return;
  }
  const current = () => revision === pageRevision && state.running && !state.paused;
  if(/^say that again[.!?]?$/i.test(text.trim())) {
    if(settings.spokenFeedback) await chrome.runtime.sendMessage({type:"SPEAK_FEEDBACK",text:state.feedback,enabled:true}).catch(()=>{});
    return;
  }
  if (isCancellation(text)) { await action({type:"cancel"},current); return; }
  const openSite = /^(?:open|take me to) (wikipedia|github|reddit|amazon|spotify|netflix|x|twitter|whatsapp|gmail|google meet|meet|linkedin|irctc|google maps|maps)$/i.exec(text.trim().replace(/[.!?]+$/,""));
  if (openSite) {
    const site = openSite[1].toLowerCase() === "twitter" ? "x" : openSite[1].toLowerCase().replace(/^google /, "") as keyof typeof siteHomes;
    if (await needTabs() || !current()) return;
    await chrome.tabs.create({url:siteHomes[site]});
    if(current()) await publish({feedback:`Opening ${site}.`});
    return;
  }
  if (/^refresh (?:this|the) page$|^reload$/i.test(text.trim())) {
    if(state.targetTabId!==null&&current())await chrome.tabs.reload(state.targetTabId); return;
  }
  const site: SiteSnapshot | null = conversation;
  if(!current())return;
  if(site?.site) {
    const steps=text.split(/\s+(?:and then|then)\s+|,\s*(?=(?:filter|sort|show|open|add|choose)\b)/i);
    if(steps.length>1) { await voicePlan(steps,site);return; }
    const dialogue = await page({type:"SITE_DIALOGUE",text});
    if(!current())return;
    if(dialogue?.state) { await siteResult(dialogue,current); return; }
    if((parsed.type==='pause'||parsed.type==='resume') && !['spotify','netflix'].includes(site.site) && !site.capabilities.some(c=>c.state==='available' && ['R24'].includes(c.id))) {await action(parsed,current);return;}
    const explicitBrowser=["new-tab","next-tab","previous-tab","close-tab","history","downloads","settings","incognito","back","forward","scroll","click","stop-typing","start-typing"].includes(parsed.type) || parsed.type==='named-tab' && /\btab\b/i.test(text);
    if(explicitBrowser) {await action(parsed,current);return;}
    const request = parseSite(text,site);
    if(request) { await action(request,current); return; }
    if(unsafeSpeech(text)) { await publish({feedback:'This is a question, commentary, negation or an excluded account operation. No page action was taken.'}); return; }
    if (/^(next|stop)$/i.test(text.trim())) { await publish({feedback:'Specify what to stop or advance, such as next episode or pause Handsfree.'}); return; }
  }
  const wake = wakeRequest(text);
  if (wake !== null) {
    wakeUntil = 0;
    if (!wake) {
      wakeUntil = Date.now() + 10000;
      await publish({ feedback: "Hey Handsfree is ready. Say your request within ten seconds." });
    } else await providerWork(signal => arbitraryFind(wake, signal));
    return;
  }
  if (wakeUntil > Date.now()) {
    wakeUntil = 0;
    await providerWork(signal => arbitraryFind(text, signal));
    return;
  }
  wakeUntil = 0;
  if (parsed.type === "find" && !site?.site) {
    const listed = await page({ type: "GET_TARGETS" });
    if (revision !== pageRevision || !state.running || state.paused) return;
    const matches = rankTargets(parsed.query, Array.isArray(listed) ? listed : []);
    const result = await page({ type: "FIND_RESULT", ids: matches.ids });
    if (result?.error) await publish({ feedback: result.error });
    return;
  }
  let classifyNamed = false;
  if (parsed.type === "click-target" && jevOptions().jevKey) {
    const listed = await page({ type: "GET_TARGETS" });
    if (revision !== pageRevision || !state.running || state.paused) return;
    classifyNamed = rankTargets(parsed.query, Array.isArray(listed) ? listed : []).kind === "none";
  }
  if (parsed.type !== "unknown" && !classifyNamed && (!site?.site || ["back","forward","scroll","new-tab","next-tab","previous-tab","named-tab","close-tab","choose","confirm","cancel","stop-typing","start-typing","click"].includes(parsed.type))) { await action(parsed); return; }
  await providerWork(async signal => {
    const options = jevOptions();
    let tabs: { id: number; title: string }[] = [];
    let targets: TargetText[] = [];
    if (options.jevKey) {
      if (await chrome.permissions.contains({ permissions: ["tabs"] }))
        tabs = (await chrome.tabs.query({})).filter(tab => tab.id !== undefined && !dashboardTabs.has(tab.id)).map(tab => ({ id: tab.id!, title: tab.title || "" }));
      const listed = await page({ type: "GET_TARGETS" });
      if (Array.isArray(listed)) targets = listed.slice(0, 80);
    }
    if (signal.aborted) return;
    const domainCandidates = site?.site ? siteCandidates(text,site) : undefined;
    const intent = await mapCommand(text, { ...options, tabs, targets, site:site?.site, siteCandidates:domainCandidates, forceClassification: classifyNamed || !!site?.site }, signal);
    if (signal.aborted || revision !== pageRevision || !state.running || state.paused) return;
    if (parsed.type === "click-target" && parsed.disposition && intent.type === "click-target")
      intent.disposition = parsed.disposition;
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
    case "DESKTOP_CONNECT": return connectDesktop();
    case "DESKTOP_DISCONNECT": await stop();await disconnectDesktop();return {ok:true};
    case "DESKTOP_STATUS":return {paired:await paired()};
    case "PREPARE_BROWSER_CAPTURE":await claimDesktop();return {ok:true};
    case "UI_VOICE": {
      if (!dashboard || sender.tab?.id === undefined) return {ok:false,error:"Open the connected dashboard to use setup voice."};
      if (!message.enabled) {
        if (uiVoiceTab === sender.tab.id) { uiVoiceTab = null; uiVoiceUntil = 0; await controller("ui-stop"); }
        return {ok:true};
      }
      if (!await activeDashboard(sender.tab.id)) return {ok:false,error:"Return to the dashboard to use setup voice."};
      if (mediaPermissions.microphone !== "granted") return {ok:false,error:"Allow microphone access in Browser access, then choose Listen for setup commands."};
      uiVoiceTab = sender.tab.id; uiVoiceUntil = Date.now() + 15000;
      await controller("ui-start"); return {ok:true};
    }
    case "UI_HEARD": {
      if (!internal || uiVoiceTab === null) return {ok:false};
      if (Date.now() > uiVoiceUntil || !await activeDashboard(uiVoiceTab)) {
        uiVoiceTab = null; uiVoiceUntil = 0; await controller("ui-stop"); return {ok:true};
      }
      await chrome.tabs.sendMessage(uiVoiceTab, {type:"UI_HEARD",text:String(message.text).slice(0,500)});
      return {ok:true};
    }
    case "UI_SPEAK": return speakUI(typeof message.text === "string" ? message.text : "");
    case "GET_PERMISSIONS": {
      const [pages, tabs, provider] = await Promise.all([
        chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] }),
        chrome.permissions.contains({ permissions: ["tabs"] }),
        chrome.permissions.contains({ origins: [settings.jevProvider === "typesafe" ? "https://api.typesafe.ai/*" : "https://openrouter.ai/*"] }),
      ]);
      return { pages, tabs, provider, ...mediaPermissions };
    }
    case "REVOKE_PERMISSION": {
      if (message.kind !== "pages" && message.kind !== "tabs") return { ok: false };
      await chrome.permissions.remove(message.kind === "pages" ? { origins: ["http://*/*", "https://*/*"] } : { permissions: ["tabs"] });
      if (message.kind === "pages" && state.running) await pause();
      return { ok: true };
    }
    case "MEDIA_PERMISSIONS":
      if ([message.camera, message.microphone].every(value => ["granted", "denied", "prompt", "unknown"].includes(value)))
        mediaPermissions = { camera: message.camera, microphone: message.microphone };
      return { ok: true };
    case "GET_SITE_CONTEXT": { const snapshot=await page({type:"GET_SITE_CONTEXT"});return snapshot?.site ? snapshot:null; }
    case "GET_STATE":
      return state;
    case "GET_SETTINGS":
      return pageSettings();
    case "GET_GESTURE_PRESETS": {
      const saved = await chrome.storage.local.get("gesturePresets");
      return normalizeGesturePresets(saved.gesturePresets);
    }
    case "SAVE_GESTURE_PRESETS": {
      if (!Array.isArray(message.presets) || message.presets.length > 5) return { ok: false, error: "Use up to five gesture presets." };
      const presets = normalizeGesturePresets(message.presets);
      if (presets.length !== message.presets.length) return { ok: false, error: "One or more presets are invalid. Review the gesture and action choices." };
      await chrome.storage.local.set({ gesturePresets: presets });
      if (state.running && !state.paused) await controller("gesture-presets", { presets });
      return presets;
    }
    case "GET_GESTURE_DESTINATIONS": {
      const labels: Record<string, string> = { wikipedia: "Wikipedia", github: "GitHub", reddit: "Reddit", amazon: "Amazon", spotify: "Spotify", netflix: "Netflix", x: "X", whatsapp: "WhatsApp Web", gmail: "Gmail", meet: "Google Meet", linkedin: "LinkedIn Jobs", irctc: "IRCTC", maps: "Google Maps" };
      const destinations = Object.entries(siteHomes).map(([id, url]) => ({ id: `site:${id}`, label: labels[id] || id, url, source: "suggested" }));
      if (await chrome.permissions.contains({ permissions: ["tabs"] })) {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.id === undefined || dashboardTabs.has(tab.id) || !/^https?:\/\//.test(tab.url || "")) continue;
          try {
            const url = new URL(tab.url!);
            if (url.username || url.password) continue;
            const id = `tab:${tab.id}`;
            if (!destinations.some(item => item.url === url.href)) destinations.push({ id, label: tab.title || url.hostname, url: url.href, source: "open-tab" });
          } catch { /* Ignore non-web tab URLs. */ }
        }
      }
      return destinations;
    }
    case "GET_GESTURE_STATUS":
      return gestureRuntimeStatus;
    case "GET_GESTURE_PREVIEW":
      return state.running && !state.paused ? gesturePreviewFrame : null;
    case "CALIBRATE_GESTURE":
      if (!state.running || state.paused || settings.voiceOnly) return { ok: false, error: "Start a running camera session before gesture calibration." };
      gesturePreviewFrame = null;
      gestureRuntimeStatus = { ready: gestureRuntimeStatus.ready, detected: null, confidence: 0, calibrating: message.gesture, calibrationProgress: 0 };
      await controller("gesture-calibrate", { gesture: message.gesture });
      return { ok: true };
    case "CANCEL_GESTURE_CALIBRATION":
      gesturePreviewFrame = null;
      await controller("gesture-cancel-calibration");
      return { ok: true };
    case "GESTURE_STATUS":
      if (internal && message.status && typeof message.status.ready === "boolean") gestureRuntimeStatus = message.status;
      return { ok: true };
    case "GESTURE_TRIGGER":
      if (internal) await runGesturePreset(message.presetId);
      return { ok: true };
    case "GESTURE_PREVIEW_FRAME":
      if (internal) {
        const frame = message.frame;
        gesturePreviewFrame = state.running && !state.paused && typeof frame === "string" && frame.length <= 350_000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(frame) ? frame : null;
      }
      return { ok: true };
    case "GET_PROVIDER_STATUS":
      return { groqKeyCount: groqOptions().groqKeys.length, jevKeyCount: jevKeys(jevOptions()).length, jevConfigured: jevKeys(jevOptions()).length > 0, activeProvider: jevKeys(jevOptions()).length ? "Jev via " + settings.jevProvider : null, sharedKeys: !providers.groqKeys && bundledProviders.groqKeys.length > 0 };
    case "SAVE_PROVIDERS":
      if (message.groqKeys !== undefined) providers.groqKeys = message.groqKeys.map(key => String(key).trim()).filter(Boolean).slice(0, 4);
      if (message.jevKeys !== undefined) {
        if (!Array.isArray(message.jevKeys) || message.jevKeys.some(key => typeof key !== "string")) return { ok: false, error: "Invalid Jev key list." };
        providers.jevKey = message.jevKey !== undefined ? String(message.jevKey).trim() : "";
        providers.jevKeys = jevKeys({ jevKey: providers.jevKey, jevKeys: message.jevKeys });
      } else if (message.jevKey !== undefined) {
        const key = String(message.jevKey).trim();
        const previous = jevKeys(jevOptions());
        providers.jevKey = key;
        providers.jevKeys = key ? jevKeys({ jevKeys: [...previous, key] }) : [];
      }
      await chrome.storage.local.set({ providers });
      return { ok: true };
    case "GET_CALIBRATION":
      return (await chrome.storage.local.get(`calibration-${message.mode}`))[`calibration-${message.mode}`];
    case "SAVE_CALIBRATION":
      await chrome.storage.local.set({ [`calibration-${message.mode}`]: message.calibration });
      return { ok: true };
    case "TRANSCRIBE_AUDIO": {
      const uiTab = uiVoiceTab;
      const setupActive = uiTab !== null && Date.now() <= uiVoiceUntil && await activeDashboard(uiTab);
      if ((!state.running && !setupActive) || settings.speechMode !== "browser") return { ok: false, error: "Voice session is stopped." };
      if (!Array.isArray(message.audio) || message.audio.length > 2000000 || !/^audio\/(webm|ogg|mp4)/.test(message.mime)) return { ok: false, error: "Invalid microphone recording." };
      const revision = pageRevision;
      const text = await transcribeAudio(new Blob([new Uint8Array(message.audio)], { type: message.mime }), { ...groqOptions(), language: settings.language }, AbortSignal.timeout(12000));
      return { text: revision === pageRevision && (state.running || setupActive && uiVoiceTab === uiTab && Date.now() <= uiVoiceUntil && await activeDashboard(uiTab!)) ? text : "" };
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
      return openPermissions(message);
    case "INSTALL_SPEECH_PACK":
      return openPermissions({ type: "GRANT_PERMISSIONS", kind: "devices", returnHash: message.returnHash }, true);
    case "SET_DASHBOARD_URL": {
      const url = new URL(message.url);
      if (!(url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return { ok: false, error: "Use an HTTPS dashboard URL or localhost for development." };
      const permitted = await chrome.permissions.contains({ origins: [url.protocol + "//" + url.hostname + "/*"] });
      if (!permitted) return { ok: false, error: "Enable webpage access in permission setup before using this dashboard URL." };
      if (settings.dashboardUrl !== url.href) dashboardTabs.clear();
      settings.dashboardUrl = url.href;
      await chrome.storage.local.set({ settings });
      return { ok: true };
    }
    case "SAVE_SETTINGS": {
      const previous = settings;
      let next = message.settings;
      // Older dashboard tabs still update voiceOnly or pointerMode directly.
      // Translate those edits only when independent input selection is unchanged.
      const unchangedInputs = Array.isArray(next.enabledInputs) && next.enabledInputs.length === inputMethods(previous).length && next.enabledInputs.every(input => inputMethods(previous).includes(input));
      if (unchangedInputs && next.voiceOnly !== previous.voiceOnly) {
        next = { ...next, enabledInputs: next.voiceOnly ? ["voice"] : ["voice", next.pointerMode] };
      } else if (unchangedInputs && next.pointerMode !== previous.pointerMode && !inputMethods(next).includes(next.pointerMode) && !next.voiceOnly) {
        next = { ...next, enabledInputs: inputMethods(next).map(input => input === previous.pointerMode ? next.pointerMode : input) };
      }
      settings = {
        ...normalizeControlSettings(next),
        llmKey: "",
        groqModel: "qwen/qwen3.8-27b",
        jevProvider: next.jevProvider === "typesafe" ? "typesafe" : "openrouter",
        language: next.language === "auto" || /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(next.language) ? next.language : "en-US",
        dashboardUrl: settings.dashboardUrl,
        llmModel: String(next.llmModel || defaults.llmModel).slice(0, 80),
      };
      const inputsChanged = settings.pointerMode !== previous.pointerMode || inputMethods(settings).length !== inputMethods(previous).length || inputMethods(settings).some(input => !inputMethods(previous).includes(input));
      if (inputsChanged) {
        activeProvider?.abort();
        pageRevision++;
        linkAuthorizationRevision++;
        ++planToken;
        planDestination = null;
        wakeUntil = 0;
        pendingClose = null;
        tabChoices = [];
        await publish({ confidence: 0, calibrationProgress: null, calibrationStage: "", calibrationSnapshots: {}, ...(!inputMethods(settings).includes("voice") ? { dictating: false, interimTranscript: "" } : {}) });
      }
      await chrome.storage.local.set({ settings, speechPreferenceVersion: 2 });
      await publish({voiceOnly:settings.voiceOnly});
      await pageState();
      await controller("settings");
      return { ok: true };
    }
    case "OPEN_CONTROLLER":
      return openController(message.tabId);
    case "OPEN_DASHBOARD":
      return openController(message.tabId, message.hash);
    case "START": {
      const revision=++captureRevision;await claimDesktop();if(revision!==captureRevision)return {ok:false,error:"Start cancelled"};
      activeProvider?.abort();
      pageRevision++;
      if (message.tabId !== undefined && !isDashboard((await chrome.tabs.get(message.tabId)).url)) await target(message.tabId);
      if (state.targetTabId === null) {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const selected = tabs.find(tab => supported(tab.url) && !isDashboard(tab.url));
        if (selected?.id !== undefined) await target(selected.id);
      }
      if(revision!==captureRevision)return {ok:false,error:"Start cancelled"};
      if (!state.running) record("run-start");
      await publish({
        running: true,
        paused: false,
        dictating: false,
        voiceOnly: settings.voiceOnly,
        feedback: settings.voiceOnly ? "Ready for voice. The camera is off. Say what can I do here or list results." : "Ready. Calibrate your pointer, or use voice.",
      });
      await pageState();
      if (state.targetTabId !== null) await attach(state.targetTabId);
      if(revision!==captureRevision)return {ok:false,error:"Start cancelled"};
      try { await controller("start"); }
      catch { if(revision===captureRevision)await stop(); return { ok: false, error: "Capture could not start. Reload the extension, allow camera and microphone, and retry." }; }
      return { ok: true };
    }
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
      if (state.running && !state.paused && !settings.voiceOnly && message.sample.source === settings.pointerMode) {
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
      if (!state.running) return { ok: true };
      const normalized = message.text.trim().toLowerCase().replace(/[.!?,]+$/, "");
      const mediaScoped = !state.paused && !state.dictating && ((normalized === "pause" && settings.pausePhrase !== "pause") || (normalized === "resume" && settings.resumePhrase !== "resume"));
      const addressed = normalized === settings.pausePhrase || normalized === settings.resumePhrase || /^stop handsfree(?: and release (?:the )?microphone)?$/.test(normalized);
      const session = mediaScoped || state.dictating && !addressed ? null : sessionIntent(message.text, settings);
      if (/^stop handsfree and release (?:the )?microphone$/.test(normalized)) { await stop(); return {ok:true}; }
      if (!state.dictating && isCancellation(message.text)) {
        activeProvider?.abort(); pageRevision++;
        await action({type:"cancel"}); return {ok:true};
      }
      if (session) {
        await action(session);
        return { ok: true };
      }
      if (state.paused) return { ok: true };
      const revision = pageRevision;
      const intent = parseIntent(message.text);
      if (["cancel", "pause", "stop"].includes(intent.type)) linkAuthorizationRevision++;
      // Typing transitions remain serialized. A click can cancel slow provider
      // work only when no earlier transcript may enter or leave dictation.
      if (
        activeProvider && !state.dictating && pendingTypingCommands === 0 &&
        ["click", "open", "click-target", "click-link", "focus-target", "show-links", "pause", "stop", "cancel"].includes(intent.type)
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
    .catch((error) =>
      respond({
        ok: false,
        error: error instanceof Error?error.message:"The action failed. Check permissions and retry.",
      }),
    );
  return true;
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  void ready.then(async () => {
    // Controlled activation commits its target once, after focus completes.
    // Do not let Chrome's echo event cancel that same in-flight action.
    if (tabActivations.has(tabId)) return;
    if (tabId === state.targetTabId) {
      // Returning to the old target while another tab is being activated is a
      // user choice, not an echo. Invalidate that transition before any reads.
      if (tabActivations.size) await target(tabId);
      return;
    }
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
    if (change.url && planDestination && change.url !== planDestination) { ++planToken; planDestination=null; }
    if (change.status === "loading") {
      wakeUntil = 0;
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
chrome.permissions.onAdded?.addListener(() => {
  void ready.then(async () => {
    if (state.running && state.targetTabId !== null) await attach(state.targetTabId);
  });
});
chrome.permissions.onRemoved?.addListener(() => {
  void ready.then(async () => {
    pendingClose = null;
    tabChoices = [];
    activeProvider?.abort();
    wakeUntil = 0;
    pageRevision++;
    if (state.running) await pause();
  });
});

onDesktopLost(()=>{void stop().then(()=>publish({feedback:"Desktop disconnected. Browser capture stopped. Open Handsfree and reconnect."}));});
