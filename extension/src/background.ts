import {readingPreferences} from "./reading/model";
import { docsInput } from "./editing/docs-input";
import {claimDesktop,releaseDesktop,connectDesktop,disconnectDesktop,paired,onDesktopLost,startCredentialControl,stopCredentialControl} from "./desktop";
import {uploadFile} from "./file-upload";
import { parseSite, siteCandidates, unsafeSpeech, isCancellation, makeRequest, validateSiteRequest } from "./sites/language";
import { siteHomes, catalogue } from "./sites/catalogue";
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
  type RoutineAction,
  type RoutineSession,
  type RoutineStep,
  type VoiceRoutine,
  emptyRoutineSession,
} from "./shared";
import { parseFormCommand, parseIntent, sessionIntent, wakeRequest } from "./core/parser";
import { mediaControl } from "./content/media";
import { bundledProviders } from "./provider-config";
import { rankTabs, rankTargets, adjacentTabId } from "./core/ranking";
import { mapCommand, resolveAgentStep, resolveArbitrary, transcribeAudio, jevKeys, cleanRamble, resolveReadingRange } from "./providers";
import { appendMetric, summarizeMetrics } from "./core/metrics";
import { normalizeGesturePresets } from "./gestures";
import type { GesturePreset, GestureRuntimeStatus } from "./shared";

let state: SessionState = { ...initialState };
let settings: Settings = { ...defaults };
let pageRevision = 0;
let readingAudio = "";
let zoomRecord: {tabId:number;url:string;before:number;after:number;settings:chrome.tabs.ZoomSettings}|null=null;
let writingProposal:{text:string;expected:string;revision:number;binding:number}|null=null;
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
const dashboardMessages = new Set(["GET_STATE", "GET_SETTINGS", "SAVE_SETTINGS", "START", "PAUSE", "RESUME", "STOP", "RECALIBRATE", "HEARD", "ACTION", "GET_LOGS", "CLEAR_LOGS", "METRIC", "GET_PROVIDER_STATUS", "SAVE_PROVIDERS", "SET_DASHBOARD_URL", "GRANT_PERMISSIONS", "INSTALL_SPEECH_PACK", "GET_TABS", "ACTIVATE_TAB", "GET_ROUTINE_SESSION", "GET_ROUTINES", "SAVE_ROUTINE", "DISCARD_ROUTINE_DRAFT", "DELETE_ROUTINE"]);
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
let tabChoices: number[] = [];
const tabActivations = new Map<number, symbol>();
let lastTrackingLog = 0;
let hadTracking = false;
let logs: MetricEvent[] = [];
let routineSession: RoutineSession = { ...emptyRoutineSession };
let playbackToken = 0;
const transcriptionRequests = new Set<AbortController>();
let nativeCredentialSession=false;
let privateReady=false;
let privateRevision=0;
const privateSession=crypto.randomUUID();
let routineIdCounter = 0;
let lastActionSucceeded = false;
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
  const routineSaved = await chrome.storage.session.get("routineSession");
  if (routineSaved.routineSession && typeof routineSaved.routineSession === "object") {
    const restored = routineSaved.routineSession as RoutineSession;
    routineSession = {
      ...emptyRoutineSession,
      recording: restored.recording === true,
      recordingPaused: restored.recordingPaused === true,
      draft: validRoutineSteps(restored.draft) ? restored.draft : [],
      playing: false,
      playbackPaused: restored.playing === true || restored.playbackPaused === true,
      playbackRoutineId: typeof restored.playbackRoutineId === "string" ? restored.playbackRoutineId : null,
      playbackStep: Number.isInteger(restored.playbackStep) && restored.playbackStep >= 0 ? restored.playbackStep : 0,
      feedback: typeof restored.feedback === "string" ? restored.feedback.slice(0, 300) : "",
    };
  }
  if (state.privateInput) {
    state.lastHeard="";state.interimTranscript="";state.voice="Off — private entry";routineSession.recordingPaused=routineSession.recording;
    void chrome.runtime.sendMessage({type:"OFFSCREEN_COMMAND",command:"private-enter",privateSession,privateRevision}).catch(()=>{});
  }
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
const routineYouTubeActions = new Set(["YT01", "YT03", "YT04", "YT05", "YT06", "YT07", "YT08", "YT09", "YT11", "YT12"]);
function safeRoutineAction(value: unknown): value is RoutineAction {
  if (!value || typeof value !== "object") return false;
  const action = value as any;
  if (action.type === "open-site") return typeof action.site === "string" && Object.hasOwn(siteHomes, action.site);
  if (action.type === "search") return typeof action.query === "string" && action.query.trim().length > 0 && action.query.length <= 200 && typeof action.background === "boolean";
  if (action.type === "switch-tab") return action.intent?.type === "indexed-tab" && Number.isInteger(action.intent.index) && action.intent.index > 0 && action.intent.index <= 100 || action.intent?.type === "named-tab" && typeof action.intent.name === "string" && action.intent.name.length > 0 && action.intent.name.length <= 100;
  if (action.type === "click-target") return typeof action.query === "string" && action.query.trim().length > 0 && action.query.length <= 100;
  if (action.type === "scroll") return ["up", "down", "top", "bottom"].includes(action.direction);
  if (action.type === "media") return ["play", "pause", "toggle"].includes(action.command);
  if (action.type === "site-command") return (action.site === "youtube" && routineYouTubeActions.has(action.action) || action.site === "whatsapp" && action.action === "WA01" && typeof action.args?.query === "string" && !!action.args.query.trim()) && !!validateSiteRequest({ ...action, type: "site-action", documentId: "routine-validation", revision: 0, requestId: "routine-validation" });
  if (action.type === "whatsapp-message") return typeof action.recipient?.identity === "string" && !!action.recipient.identity.trim() && action.recipient.identity.length <= 300 && typeof action.recipient.label === "string" && !!action.recipient.label.trim() && action.recipient.label.length <= 180 && typeof action.text === "string" && !!action.text.trim() && action.text.length <= 5000;
  if (action.type === "navigate") return ["back", "forward"].includes(action.direction);
  return false;
}
function validRoutineSteps(value: unknown): value is RoutineStep[] {
  return Array.isArray(value) && value.length <= 20 && value.every((step: any) => step && typeof step.id === "string" && step.id.length <= 80 && typeof step.label === "string" && step.label.length <= 160 && safeRoutineAction(step.action));
}
async function getRoutines(): Promise<VoiceRoutine[]> {
  const stored = await chrome.storage.local.get("voiceRoutines");
  if (!Array.isArray(stored.voiceRoutines)) return [];
  return stored.voiceRoutines.filter((routine: any) => routine && typeof routine.id === "string" && typeof routine.name === "string" && routine.name.length <= 60 && validRoutineSteps(routine.steps) && typeof routine.createdAt === "number" && typeof routine.updatedAt === "number").slice(0, 20);
}
async function setRoutineSession(next: RoutineSession, feedback?: string, announce = false) {
  routineSession = { ...next, feedback: feedback ?? next.feedback };
  await chrome.storage.session.set({ routineSession });
  if (feedback) {
    await publish({ feedback });
    // Routine recording is an explicit mode. Always announce its state
    // transitions, even when optional, general spoken feedback is disabled.
    if (announce && !settings.spokenFeedback)
      void chrome.runtime.sendMessage({ type: "SPEAK_FEEDBACK", text: feedback.slice(0, 1200), enabled: true }).catch(() => {});
  }
}
function routineActionFromCommand(text: string, intent: Intent): RoutineAction | null {
  if (intent.type === "site-action" && intent.site === "whatsapp" && intent.action === "WA01" && intent.args.query)
    return { type: "site-command", site: "whatsapp", action: "WA01", args: { query: intent.args.query } };
  if (intent.type === "site-action" && intent.site === "youtube" && routineYouTubeActions.has(intent.action))
    return { type: "site-command", site: "youtube", action: intent.action, args: { ...intent.args } } as RoutineAction;
  const command = text.normalize("NFKC").trim().toLowerCase().replace(/[.!?,;:]+$/, "").replace(/\s+/g, " ");
  const site = /^(?:open|take me to) (wikipedia|github|reddit|amazon|spotify|netflix|youtube|chatgpt|chat gpt|ai chat|x|twitter|whatsapp|gmail|google meet|meet|linkedin|irctc|google maps|maps)$/i.exec(command);
  if (site) {
    const spoken = site[1].toLowerCase();
    const id = (spoken === "twitter" ? "x" : ["chat gpt", "ai chat"].includes(spoken) ? "chatgpt" : spoken.replace(/^google /, "")) as keyof typeof siteHomes;
    return Object.hasOwn(siteHomes, id) ? { type: "open-site", site: id } : null;
  }
  if (intent.type === "search") return { type: "search", query: intent.query.slice(0, 200), background: intent.background };
  if (intent.type === "indexed-tab" || intent.type === "named-tab") return { type: "switch-tab", intent };
  if (intent.type === "click-target") return { type: "click-target", query: intent.query.slice(0, 100) };
  if (intent.type === "scroll") return { type: "scroll", direction: intent.direction };
  if (intent.type === "media-play") return { type: "media", command: "play" };
  if (intent.type === "media-pause") return { type: "media", command: "pause" };
  if (intent.type === "media-toggle") return { type: "media", command: "toggle" };
  // Adapter-routed media commands arrive here as `site-action`, so the
  // generic media Intent checks above do not describe what was actually run.
  // Preserve the operation from the adapter action as well as common spoken
  // equivalents such as Spotify's “continue playing”.
  if (intent.type === "site-action") {
    const action = `${intent.site}:${intent.action}`;
    if (["spotify:S05", "spotify:S07", "netflix:N04", "netflix:N07", "youtube:YT11"].includes(action))
      return { type: "media", command: "play" };
    if (["spotify:S06", "netflix:N06", "youtube:YT05"].includes(action))
      return { type: "media", command: "pause" };
    if (action === "reddit:R24")
      return { type: "media", command: intent.args.mode?.startsWith("pause") ? "pause" : "play" };
  }
  if (/^(?:continue playing|resume(?: the| this)?(?: music| song| video| episode)?|play(?: the| this)?(?: music| song| video| playback)?)$/.test(command))
    return { type: "media", command: "play" };
  if (/^(?:pause(?: the| this)?(?: music| song| video| episode)?|hold(?: the)? music|stop playing for a moment)$/.test(command))
    return { type: "media", command: "pause" };
  if (/^(?:toggle playback|play or pause|pause or play)$/.test(command))
    return { type: "media", command: "toggle" };
  if (intent.type === "back" || intent.type === "forward") return { type: "navigate", direction: intent.type };
  return null;
}
async function appendRoutineStep(action: RoutineAction) {
  if (!routineSession.recording || routineSession.recordingPaused) return;
  if (routineSession.draft.length >= 20) { await publish({ feedback: "This recording reached the 20-step limit. Say “stop recording routine” and review the draft in the dashboard." }); return; }
  const label = (action.type === "whatsapp-message" ? `Send WhatsApp to ${action.recipient.label}: ${action.text}` : action.type === "site-command" ? `${action.site === "whatsapp" ? "WhatsApp" : "YouTube"}: ${catalogue.find(spec => spec.id === action.action)?.description || action.action}${action.args.query ? ` — ${action.args.query}` : action.args.index ? ` — video ${action.args.index}` : action.args.value !== undefined ? ` — ${action.args.value}` : action.args.mode ? ` — ${action.args.mode}` : ""}` : action.type === "open-site" ? `Open ${action.site}` : action.type === "search" ? `Search for ${action.query}${action.background ? " in the background" : " in a new tab"}` : action.type === "switch-tab" ? action.intent.type === "indexed-tab" ? `Switch to tab ${action.intent.index}` : `Switch to ${action.intent.name} tab` : action.type === "click-target" ? `Open ${action.query}` : action.type === "scroll" ? `Scroll ${action.direction}` : action.type === "media" ? `Media ${action.command}` : `Go ${action.direction}`).slice(0, 160);
  const step: RoutineStep = { id: `step-${Date.now()}-${++routineIdCounter}`, label, action };
  await setRoutineSession({ ...routineSession, draft: [...routineSession.draft, step] }, `Step ${routineSession.draft.length + 1} recorded: ${label}.`);
}
function routineIntent(action: RoutineAction): Intent {
  if (action.type === "site-command" || action.type === "whatsapp-message") throw new Error("Site routine steps require a fresh page snapshot.");
  if (action.type === "open-site") return { type: "new-tab" };
  if (action.type === "search") return { type: "search", query: action.query, background: action.background };
  if (action.type === "switch-tab") return action.intent;
  if (action.type === "click-target") return { type: "click-target", query: action.query };
  if (action.type === "scroll") return { type: "scroll", direction: action.direction };
  if (action.type === "media") return { type: action.command === "toggle" ? "media-toggle" : action.command === "play" ? "media-play" : "media-pause" };
  return { type: action.direction };
}
interface RoutineDestination { tabId?: number; url?: string }
interface RoutineExpectation { site: string; player: boolean; videos?: boolean; recipient?: { identity: string; label: string } }
function routineExpectation(action?: RoutineAction): RoutineExpectation | undefined {
  if (action?.type === "whatsapp-message") return { site: "whatsapp", player: false };
  if (action?.type !== "site-command") return undefined;
  if (action.site === "whatsapp") return { site: "whatsapp", player: false };
  return { site: action.site, player: !["YT01", "YT03", "YT04"].includes(action.action), videos: ["YT03", "YT04"].includes(action.action) };
}
async function applyRoutineSiteResult(result: SiteResult | null, destination: RoutineDestination, valid: () => boolean): Promise<boolean> {
  if (!result || !valid()) return false;
  const succeeded = ["available", "already-satisfied"].includes(result.state);
  if (succeeded && result.navigate) {
    const url = new URL(result.navigate.url);
    if (!["https:", "http:"].includes(url.protocol)) return false;
    destination.url = url.href;
    if (result.navigate.newTab) {
      if (await needTabs() || !valid()) return false;
      const tab = await chrome.tabs.create({ url: url.href, active: true });
      if (tab.id === undefined || !valid()) return false;
      destination.tabId = tab.id;
      await target(tab.id);
      if (valid()) await publish({ feedback: result.feedback });
      return valid();
    }
    destination.tabId = state.targetTabId ?? undefined;
  }
  await siteResult(result, valid);
  return succeeded && valid();
}
async function executeRoutineAction(step: RoutineStep, destination: RoutineDestination, valid: () => boolean): Promise<boolean> {
  if (!valid() || !safeRoutineAction(step.action)) return false;
  if (step.action.type === "open-site") {
    if (await needTabs() || !valid()) return false;
    const tab = await chrome.tabs.create({ url: siteHomes[step.action.site], active: true });
    destination.tabId = tab.id;
    destination.url = siteHomes[step.action.site];
    if (tab.id !== undefined) await target(tab.id);
    return tab.id !== undefined && valid();
  }
  if (step.action.type === "search") {
    if (await needTabs() || !valid()) return false;
    const url = "https://www.google.com/search?q=" + encodeURIComponent(step.action.query);
    const tab = await chrome.tabs.create({ url, active: !step.action.background });
    if (!step.action.background && tab.id !== undefined && valid()) {
      destination.tabId = tab.id;
      destination.url = url;
      await target(tab.id);
    }
    return tab.id !== undefined && valid();
  }
  if (step.action.type === "click-target") {
    const targets = await page({ type: "GET_TARGETS" });
    if (!Array.isArray(targets) || rankTargets(step.action.query, targets).kind !== "match") return false;
  }
  let site = await page({ type: "GET_SITE_CONTEXT" });
  if (!valid()) return false;
  if (step.action.type === "whatsapp-message") {
    if (site?.site !== "whatsapp") return false;
    if (site.current?.identity !== step.action.recipient.identity || site.current?.label !== step.action.recipient.label) {
      const request = makeRequest(site, "WA01", { query: step.action.recipient.label });
      const opened = await page({ type: "PAGE_ACTION", intent: request });
      if (!await applyRoutineSiteResult(opened, destination, valid) || !await waitForRoutinePage(playbackToken, { site: "whatsapp", player: false, recipient: step.action.recipient }, destination) || !valid()) return false;
      site = await page({ type: "GET_SITE_CONTEXT" });
      if (!valid() || site?.current?.identity !== step.action.recipient.identity || site.current?.label !== step.action.recipient.label) return false;
    }
    const result = await page({ type: "RUN_WHATSAPP_MESSAGE", message: { recipient: step.action.recipient, text: step.action.text }, requestId: `routine-${playbackToken}-${step.id}-${Date.now()}` });
    if (result?.state === "failed" && valid()) {
      await setRoutineSession({ ...routineSession, playing: false, playbackPaused: false, playbackRoutineId: null, playbackStep: 0 }, "Routine stopped: WhatsApp could not verify the send. Inspect the chat before running it again; the message will not be retried automatically.", true);
      return false;
    }
    return applyRoutineSiteResult(result, destination, valid);
  }
  if (step.action.type === "site-command") {
    if (site?.site !== step.action.site) return false;
    const request = makeRequest(site, step.action.action, { ...step.action.args });
    const result = await page({ type: "PAGE_ACTION", intent: request });
    return applyRoutineSiteResult(result, destination, valid);
  }
  const spoken = step.action.type === "switch-tab" ? step.action.intent.type === "indexed-tab" ? `go to tab ${step.action.intent.index}` : `go to ${step.action.intent.name} tab`
    : step.action.type === "click-target" ? `click ${step.action.query}`
    : step.action.type === "scroll" ? `scroll ${step.action.direction}`
    : step.action.type === "media" ? site?.site === "spotify"
      ? step.action.command === "play" ? "continue playing" : step.action.command === "pause" ? "pause the music" : "toggle playback"
      : step.action.command === "toggle" ? "toggle playback" : `${step.action.command} the video`
    : `go ${step.action.direction}`;
  if (site?.site) {
    if (step.action.type === "media") {
      const request = parseSite(spoken, site);
      if (request) {
        const result = await page({ type: "PAGE_ACTION", intent: request });
        return applyRoutineSiteResult(result, destination, valid);
      }
    }
    const dialogue = await page({ type: "SITE_DIALOGUE", text: spoken });
    if (dialogue?.state) {
      return applyRoutineSiteResult(dialogue, destination, valid);
    }
    // Spotify hides its audio element from the generic media helper. If its
    // dedicated site adapter cannot handle a routine step, pause instead of
    // issuing an unrelated video/audio action and skipping later routine steps.
    if (site.site === "spotify" && step.action.type === "media") return false;
  }
  const intent = routineIntent(step.action);
  await action(intent, valid);
  return lastActionSucceeded;
}
/** Executed in the active site tab while a routine waits for its next media step. */
function routinePlayerReady(site: string): boolean {
  if (site === "spotify") {
    let controls = [...document.querySelectorAll<HTMLElement>('[data-testid="control-button-playpause"]')];
    if (controls.length !== 1) controls = [...document.querySelectorAll<HTMLElement>('button,[role="button"]')].filter(control =>
      /^(?:play|pause)$/i.test((control.getAttribute("aria-label") || control.title || control.textContent || "").trim()) && control.getClientRects().length > 0,
    );
    return controls.length === 1 && /^(?:play|pause)(?:\s|$)/i.test(
      (controls[0].getAttribute("aria-label") || controls[0].title || controls[0].textContent || "").trim(),
    );
  }
  if (site === "youtube") {
    const video = document.querySelector<HTMLVideoElement>("#movie_player video, video.html5-main-video");
    return !!video && video.readyState >= 1;
  }
  if (site === "netflix")
    return !!document.querySelector("video, button[aria-label='Play'], button[aria-label='Pause']");
  return !!document.querySelector("audio, video");
}
function routineUrlMatches(actual: string, expected: string): boolean {
  try {
    const pageUrl = new URL(actual), destination = new URL(expected);
    return pageUrl.origin === destination.origin && pageUrl.pathname === destination.pathname &&
      [...destination.searchParams].every(([key, value]) => pageUrl.searchParams.getAll(key).includes(value));
  } catch { return false; }
}
async function waitForRoutinePage(token: number, expectation?: RoutineExpectation, destination: RoutineDestination = {}): Promise<boolean> {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && token === playbackToken && routineSession.playing && !routineSession.playbackPaused) {
    const tabId = destination.tabId ?? state.targetTabId;
    if (destination.tabId !== undefined && state.targetTabId !== destination.tabId) return false;
    if (tabId !== null) {
      const [tab, context, site] = await Promise.all([
        chrome.tabs.get(tabId).catch(() => null),
        page({ type: "GET_PAGE_CONTEXT" }, tabId),
        expectation ? page({ type: "GET_SITE_CONTEXT" }, tabId) : Promise.resolve(null),
      ]);
      if (tab?.status === "complete" && context && typeof context.url === "string" && context.url === tab.url) {
        if (destination.url && !routineUrlMatches(context.url, destination.url) || expectation && (site?.site !== expectation.site || site.url !== context.url || expectation.videos && !site.entities?.some((entity: { kind: string }) => entity.kind === "video") || expectation.recipient && (site.current?.identity !== expectation.recipient.identity || site.current?.label !== expectation.recipient.label))) {
          await new Promise(resolve => setTimeout(resolve, 200));
          continue;
        }
        if (expectation?.player) {
          const probe = await chrome.scripting.executeScript({ target: { tabId }, func: routinePlayerReady, args: [expectation.site] }).catch(() => []);
          if (probe[0]?.result !== true) {
            await new Promise(resolve => setTimeout(resolve, 200));
            continue;
          }
        }
        return true;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return false;
}
function routineActionMayNavigate(action: RoutineAction): boolean {
  return action.type === "open-site" || action.type === "search" || action.type === "switch-tab" || action.type === "click-target" || action.type === "navigate" || action.type === "site-command" && ["YT01", "YT03", "YT04", "WA01"].includes(action.action);
}
async function runRoutine(name: string) {
  const routines = await getRoutines();
  const routine = routines.find(item => item.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  if (!routine) { await setRoutineSession(routineSession, `I couldn't find a routine named ${name}. Say “list my routines” to hear the saved names.`); return; }
  if (!routine.steps.length) { await setRoutineSession(routineSession, `“${routine.name}” has no steps to run.`); return; }
  if (routineSession.playbackPaused) { await publish({ feedback: "A routine is paused. Say “resume routine” or “stop routine” before starting another." }); return; }
  const token = ++playbackToken;
  await setRoutineSession({ ...routineSession, playing: true, playbackPaused: false, playbackRoutineId: routine.id, playbackStep: 0 }, `Running ${routine.name}.`, true);
  for (let index = routineSession.playbackStep; index < routine.steps.length; index++) {
    if (token !== playbackToken || routineSession.playbackPaused || !routineSession.playing) return;
    const step = routine.steps[index];
    await setRoutineSession({ ...routineSession, playbackStep: index }, `Preparing step ${index + 1} of ${routine.steps.length}: ${step.label}.`);
    const valid = () => token === playbackToken && routineSession.playing && !routineSession.playbackPaused && state.running && !state.paused;
    const destination: RoutineDestination = {};
    const precondition = routineExpectation(step.action);
    const prepared = !precondition || await waitForRoutinePage(token, precondition);
    if (!valid()) return;
    // Only consume the step once its prerequisites are ready and it is about
    // to execute. Pausing during a loading wait must not skip that command.
    if (prepared) await setRoutineSession({ ...routineSession, playbackStep: index + 1 }, `Running step ${index + 1} of ${routine.steps.length}: ${step.label}.`);
    const success = prepared && await executeRoutineAction(step, destination, valid);
    if (token !== playbackToken || routineSession.playbackPaused || !routineSession.playing) return;
    const nextStep = routine.steps[index + 1];
    const expectation = routineExpectation(nextStep?.action) ?? (step.action.type === "open-site" && nextStep?.action.type === "media"
      ? { site: step.action.site, player: true } : undefined);
    const ready = success && (!routineActionMayNavigate(step.action) || await waitForRoutinePage(token, expectation, destination));
    if (!valid()) return;
    if (!ready) {
      const blocked = success && nextStep ? index + 1 : index;
      await setRoutineSession({ ...routineSession, playing: false, playbackPaused: true, playbackStep: blocked, playbackRoutineId: routine.id }, `Routine paused at step ${blocked + 1}: ${routine.steps[blocked].label}. It could not be confirmed; resolve the page or target, then say “resume routine” or “stop routine”.`, true);
      return;
    }
    await setRoutineSession({ ...routineSession, playbackStep: index + 1 });
  }
  if (token === playbackToken) await setRoutineSession({ ...routineSession, playing: false, playbackPaused: false, playbackStep: 0, playbackRoutineId: null }, `Finished routine ${routine.name}.`, true);
}
async function routineControl(command: Extract<Intent, {type:"routine-control"}>) {
  if (command.command === "start-recording") {
    if (routineSession.playing || routineSession.playbackPaused) { await publish({ feedback: "Stop or finish the paused routine before starting a new recording." }); return; }
    if (routineSession.recording || routineSession.draft.length) { await publish({ feedback: "A routine draft is already open. Review or discard it in the dashboard before starting another." }); return; }
    await setRoutineSession({ ...routineSession, recording: true, recordingPaused: false, draft: [] }, "Recording started. Use supported voice commands, then say “stop recording routine” to review it in the dashboard.", true); return;
  }
  if (command.command === "pause-recording" || command.command === "resume-recording") {
    if (!routineSession.recording) { await publish({ feedback: "No routine is being recorded." }); return; }
    const recordingPaused = command.command === "pause-recording";
    await setRoutineSession({ ...routineSession, recordingPaused }, recordingPaused ? "Routine recording paused." : "Routine recording resumed.", true); return;
  }
  if (command.command === "undo-step") {
    if (!routineSession.draft.length) { await publish({ feedback: "There is no routine step to undo." }); return; }
    const draft = routineSession.draft.slice(0, -1);
    await setRoutineSession({ ...routineSession, draft }, `Removed the last step. ${draft.length} ${draft.length === 1 ? "step" : "steps"} remain.`); return;
  }
  if (command.command === "stop-recording") {
    if (!routineSession.recording) { await publish({ feedback: "No routine is being recorded." }); return; }
    await setRoutineSession({ ...routineSession, recording: false, recordingPaused: false }, routineSession.draft.length ? `Recording ended. ${routineSession.draft.length} ${routineSession.draft.length === 1 ? "step" : "steps"} captured. Review and save the draft in Dashboard → Routines.` : "Recording ended with no supported successful actions. Try a supported command, then record again.", true); return;
  }
  if (command.command === "list") {
    const routines = await getRoutines();
    await publish({ feedback: routines.length ? `Saved routines: ${routines.map((routine, i) => `${i + 1}. ${routine.name}`).join("; ")}. Say “run” followed by a name.` : "You have no saved routines yet. Say “start recording a routine” to create one." }); return;
  }
  if (command.command === "run") {
    if (routineSession.playing) { await publish({ feedback: "A routine is already running. Say “pause routine” or “stop routine”." }); return; }
    if (routineSession.playbackPaused) { await publish({ feedback: "A routine is paused. Say “resume routine” or “stop routine” before starting another." }); return; }
    void runRoutine(command.name || "").catch(error => publish({ feedback: error instanceof Error ? error.message : "Routine playback failed." })); return;
  }
  if (command.command === "pause-playback") {
    if (!routineSession.playing) { await publish({ feedback: "No routine is currently running." }); return; }
    ++playbackToken;
    await page({ type: "SITE_DIALOGUE", text: "cancel" });
    await setRoutineSession({ ...routineSession, playing: false, playbackPaused: true }, "Routine paused. Say “resume routine” to continue, or “stop routine” to cancel.", true); return;
  }
  if (command.command === "resume-playback") {
    if (!routineSession.playbackPaused || !routineSession.playbackRoutineId) { await publish({ feedback: "There is no paused routine to resume." }); return; }
    void resumeRoutinePlayback().catch(error => publish({ feedback: error instanceof Error ? error.message : "Routine playback failed." })); return;
  }
  if (command.command === "stop-playback") {
    ++playbackToken;
    await page({ type: "SITE_DIALOGUE", text: "cancel" });
    if (!routineSession.playing && !routineSession.playbackPaused) { await publish({ feedback: "No routine is currently running." }); return; }
    await setRoutineSession({ ...routineSession, playing: false, playbackPaused: false, playbackRoutineId: null, playbackStep: 0 }, "Routine stopped. Completed actions were left as they are.", true);
  }
}
async function resumeRoutinePlayback() {
    const routines = await getRoutines();
    const routine = routines.find(item => item.id === routineSession.playbackRoutineId);
    if (!routine) { await setRoutineSession({ ...routineSession, playbackPaused: false, playbackRoutineId: null }, "The saved routine no longer exists. Playback stopped."); return; }
    const index = routineSession.playbackStep;
    const token = ++playbackToken;
    await setRoutineSession({ ...routineSession, playing: true, playbackPaused: false }, `Resuming ${routine.name}.`, true);
    for (let i = index; i < routine.steps.length; i++) {
      if (token !== playbackToken || !routineSession.playing || routineSession.playbackPaused) return;
      const step = routine.steps[i];
      await setRoutineSession({ ...routineSession, playbackStep: i }, `Preparing step ${i + 1} of ${routine.steps.length}: ${step.label}.`);
      const valid = () => token === playbackToken && routineSession.playing && !routineSession.playbackPaused && state.running && !state.paused;
      const destination: RoutineDestination = {};
      const precondition = routineExpectation(step.action);
      const prepared = !precondition || await waitForRoutinePage(token, precondition);
      if (!valid()) return;
      if (prepared) await setRoutineSession({ ...routineSession, playbackStep: i + 1 }, `Running step ${i + 1} of ${routine.steps.length}: ${step.label}.`);
      const success = prepared && await executeRoutineAction(step, destination, valid);
      if (token !== playbackToken || !routineSession.playing || routineSession.playbackPaused) return;
      const nextStep = routine.steps[i + 1];
      const expectation = routineExpectation(nextStep?.action) ?? (step.action.type === "open-site" && nextStep?.action.type === "media"
        ? { site: step.action.site, player: true } : undefined);
      const ready = success && (!routineActionMayNavigate(step.action) || await waitForRoutinePage(token, expectation, destination));
      if (!valid()) return;
      if (!ready) {
        const blocked = success && nextStep ? i + 1 : i;
        await setRoutineSession({ ...routineSession, playing: false, playbackPaused: true, playbackStep: blocked, playbackRoutineId: routine.id }, `Routine paused at step ${blocked + 1}: ${routine.steps[blocked].label}. Resolve the target, then say “resume routine” or “stop routine”.`, true); return;
      }
    }
    await setRoutineSession({ ...routineSession, playing: false, playbackPaused: false, playbackStep: 0, playbackRoutineId: null }, `Finished routine ${routine.name}.`, true); return;
}
async function voiceAction(text: string, intent: Intent, current: () => boolean = () => true) {
  if (routineSession.recording && !routineSession.recordingPaused && intent.type === "site-action" && intent.site === "whatsapp" && intent.action === "WA06") {
    const draft = await page({ type: "GET_WHATSAPP_DRAFT" });
    if (!current()) return;
    const step = draft && { type: "whatsapp-message", recipient: draft.recipient, text: draft.text };
    if (!safeRoutineAction(step)) { await publish({ feedback: "Open the exact WhatsApp chat, dictate a message, then say “stop typing” and “send this message” to record it." }); return; }
    await appendRoutineStep(step);
    await publish({ feedback: `Recorded automatic send to ${step.type === "whatsapp-message" ? step.recipient.label : "the recipient"}. No message was sent during setup. Review and save the routine to enable sending.` });
    return;
  }
  if (intent.type === "click-target") {
    const targets = await page({ type: "GET_TARGETS" });
    if (!current() || !Array.isArray(targets) || rankTargets(intent.query, targets).kind !== "match") {
      await action(intent, current);
      return;
    }
  }
  await action(intent, current);
  if (!lastActionSucceeded) return;
  const step = routineActionFromCommand(text, intent);
  if (step) await appendRoutineStep(step);
}
async function publish(patch: Partial<SessionState>, persist = true) {
  const oldFeedback = state.feedback;
  state = { ...state, ...patch };
  if (state.privateInput) { state.lastHeard=""; state.interimTranscript=""; }
  if (!state.privateInput && patch.feedback && patch.feedback !== oldFeedback && settings.spokenFeedback)
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
      activityMode: state.activityMode, modeAutomatic: state.modeAutomatic,
      privateInput: state.privateInput,
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
        feedback: /^chrome:\/\/(?:newtab|new-tab-page)(?:\/|$)/.test(tab.url ?? tab.pendingUrl ?? "")
          ? 'New tab ready. Say "search for" followed by your query, or use the address bar.'
          : "This is a protected browser page. Handsfree controls supported HTTP or HTTPS webpages only.",
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
  activeProvider?.abort();
  pageRevision++;
  if (state.targetTabId !== null && state.targetTabId !== tabId)
    await page({
      type: "PAGE_STATE",
      privateInput: state.privateInput,
      running: false,
      paused: true,
      dictating: false,
      settings: pageSettings(),
    });
  tabChoices = [];
  readingAudio=""; writingProposal=null; zoomRecord=null;
  await publish({ targetTabId: tabId, dictating: false, confidence: 0, activityMode:"browsing", modeAutomatic:true, modeReason:"New tab. Waiting for deliberate task evidence." });
  await attach(tabId);
}
async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT], documentUrls: [chrome.runtime.getURL("offscreen.html")] });
  if (contexts.length) return;
  if (!creatingOffscreen) creatingOffscreen = chrome.offscreen.createDocument({ url: "offscreen.html", reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.WORKERS, chrome.offscreen.Reason.AUDIO_PLAYBACK], justification: "Keep camera tracking and microphone recognition responsive while browsing other tabs." }).finally(() => { creatingOffscreen = null; });
  await creatingOffscreen;
}
const captureChecks=new Set<chrome.runtime.Port>();
async function releaseIdleDesktop(){if(!state.running&&uiVoiceTab===null&&!captureChecks.size)await releaseDesktop();}
let captureRevision=0;
async function controller(command: Extract<Message, {type: "OFFSCREEN_COMMAND"}>["command"], options: { gesture?: import("./shared").HandGesture; presets?: GesturePreset[]; privateRevision?:number } = {}) {
  if (command === "start" || command === "ui-start") {
    const revision=captureRevision;await claimDesktop();
    if(revision!==captureRevision||command==="start"&&!state.running)throw new Error("Capture start cancelled");
    await ensureOffscreen();
    if(revision!==captureRevision||command==="start"&&!state.running){const contexts=await chrome.runtime.getContexts({contextTypes:[chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]});if(contexts.length&&!state.running)await chrome.offscreen.closeDocument();throw new Error("Capture start cancelled");}
  }
  if (command !== "start" && command !== "ui-start") {
    const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
    if (!contexts.length) {if(command==="ui-stop")await releaseIdleDesktop();return {ok:true};}
  }
  if (state.privateInput && command !== "private-exit" && command !== "stop") {
    await chrome.runtime.sendMessage({type:"OFFSCREEN_COMMAND",command:"private-enter",privateSession,privateRevision});
    if (command === "ui-start") return;
  }
  const result=await chrome.runtime.sendMessage({type:"OFFSCREEN_COMMAND",command,settings:pageSettings(),...options,...(command==="private-enter"||command==="private-exit"?{privateSession,privateRevision:options.privateRevision??privateRevision}:{})}).catch(()=>null);
  if(command==="private-exit"&&result?.ok!==true)throw new Error("Voice remains off. Private entry changed; retry when finished.");
  if(command==="ui-stop")await releaseIdleDesktop();
}
async function stop() {
  captureRevision++;
  nativeCredentialSession=false;await stopCredentialControl();
  uiVoiceTab = null; uiVoiceUntil = 0; ++narrationToken; chrome.tts?.stop();
  ++planToken; planDestination=null;
  activeProvider?.abort();
  pageRevision++;
  ++playbackToken;
  if (routineSession.recording || routineSession.playing || routineSession.playbackPaused)
    await setRoutineSession({ ...routineSession, recording: false, recordingPaused: false, playing: false, playbackPaused: false, playbackRoutineId: null, playbackStep: 0 }, "Handsfree stopped. Routine playback stopped; any recording draft remains available in the dashboard.", true);
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
  await releaseIdleDesktop();
  await chrome.storage.local.set({ logs });
}
async function pause() {
  ++planToken; planDestination=null;
  activeProvider?.abort();
  pageRevision++;
  if (routineSession.playing) {
    ++playbackToken;
    await setRoutineSession({ ...routineSession, playing: false, playbackPaused: true }, "Handsfree paused. Routine playback is paused too; resume Handsfree, then say “resume routine”.");
  }
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
  url.searchParams.set("return", options?.returnHash === "#setup" ? "#setup" : options?.returnHash === "#access" ? "#access" : "#preferences");
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
async function tabAction(intent: Intent, current: () => boolean): Promise<boolean> {
  const revision = pageRevision;
  const targetId = state.targetTabId;
  const valid = () => current() && revision === pageRevision && state.running && !state.paused && state.targetTabId === targetId;
  if (await needTabs() || !valid()) return false;
  const tabs = await chrome.tabs.query({});
  if (!valid()) return false;
  let succeeded = false;
  const browse = tabs.filter(
    (t) => !dashboardTabs.has(t.id ?? -1) && t.id !== controllerTabId && t.id !== undefined && !t.url?.startsWith(chrome.runtime.getURL("")),
  );
  switch (intent.type) {
    case "new-tab":
      await chrome.tabs.create({ active: true, windowId: browse.find(t => t.id === targetId)?.windowId });
      succeeded = true;
      break;
    case "search":
      await chrome.tabs.create({
        url:
          "https://www.google.com/search?q=" + encodeURIComponent(intent.query),
        active: !intent.background,
        windowId: browse.find(t => t.id === targetId)?.windowId,
      });
      succeeded = true;
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
      if (id != null) { await activateTab(id, valid); succeeded = state.targetTabId === id; }
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
      await activateTab(selected.id, valid); succeeded = state.targetTabId === selected.id;
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
      } else { const id = Number(matches.ids[0]); await activateTab(id, valid); succeeded = state.targetTabId === id; }
      break;
    }
    case "close-tab":
      if (targetId === null || !browse.some(t => t.id === targetId)) break;
      await chrome.tabs.remove(targetId);
      record("tab-close");
      break;
    case "incognito": {
      const allowed = await chrome.extension.isAllowedIncognitoAccess();
      if (!valid()) return false;
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
      succeeded = true;
      break;
  }
  return succeeded;
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
async function arbitrarySingle(query: string, signal?: AbortSignal) {
  const parsed = parseIntent(query);
  if (parsed.type === "form-command") {
    await action(parsed, () => !signal?.aborted && state.running && !state.paused);
    return;
  }
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
async function arbitraryFind(text:string){
  const query = wakeRequest(text);
  if (!query) {
    await publish({ feedback: 'Start each arbitrary request with "hey handsfree", followed by your request.' });
    return;
  }
  // Direct requests keep their existing finite command contract. Explicit sequences use fresh-page steps.
  await providerWork(signal=> /\b(?:then|after that)\b|\band (?:play|open|click|search|scroll|pause)\b/i.test(query)
    ? arbitraryPlan(query,signal) : arbitrarySingle(query,signal));
}
async function arbitraryPlan(query: string, signal:AbortSignal) {
  const options = groqOptions();
  if (!options.groqKeys.length) { await publish({ feedback: "Add a Groq key in the website dashboard to use hey handsfree commands." }); return; }
  const tabId = state.targetTabId;
  if (tabId === null || !state.running || state.paused) return;
  const token = ++planToken;
  const current = () => !signal.aborted && token === planToken && state.running && !state.paused && !state.dictating && state.targetTabId === tabId;
  await publish({ feedback: "Working through your request with Groq…" });
  record("find-request");
  try {
    for (let step = 0; step < 8 && current(); step++) {
      let listed: unknown;
      let context: unknown;
      const deadline = Date.now() + 6000;
      do {
        if (!current()) return;
        listed = await page({ type: "GET_TARGETS" }, tabId);
        context = await page({ type: "GET_PAGE_CONTEXT" }, tabId);
        if (Array.isArray(listed) && context && typeof context === "object" && typeof (context as PageContext).url === "string") break;
        await new Promise(resolve => setTimeout(resolve, 200));
      } while (Date.now() < deadline && current());
      if (!current()) return;
      if (!Array.isArray(listed) || !context || typeof context !== "object" || typeof (context as PageContext).url !== "string") {
        await publish({ feedback: "I could not read the current page. Reload it or check Handsfree webpage access." });
        return;
      }
      const targets: TargetText[] = listed.slice(0, 100).map((t: any) => ({ id: String(t.id), text: String(t.text).slice(0, 180), role: String(t.role).slice(0, 80) }));
      const pageContext: PageContext = { title: String((context as PageContext).title).slice(0, 500), url: String((context as PageContext).url).slice(0, 2000), text: String((context as PageContext).text).slice(0, 12000) };
      const result = await resolveAgentStep(query, targets, pageContext, options, signal);
      if (!current()) return;
      if (result.clarify) { await publish({ feedback: result.clarify }); return; }
      if (result.answer) {
        const response = await page({ type: "ANSWER", text: result.answer }, tabId);
        if (current()) await publish({ feedback: response?.error || result.answer });
        return;
      }
      if (result.done) { await publish({ feedback: "Done." }); record("agent-done"); return; }
      if (!result.action) throw new Error("Groq did not choose a browser action.");
      const beforeUrl = pageContext.url;
      const beforeSignature = `${pageContext.title}\n${pageContext.text.slice(0, 1000)}`;
      await publish({ feedback: `Step ${step + 1}: ${result.action.type === "search" ? "searching this page" : result.action.type === "click" ? "opening the selected control" : result.action.type === "media" ? `${result.action.command}ing media` : `scrolling ${result.action.direction}`}…` });
      const response = result.action.type === "media"
        ? (await action({ type: result.action.command === "play" ? "media-play" : "media-pause" }, current), { ok: current() })
        : await page({ type: "AGENT_ACTION", action: result.action }, tabId);
      if (!current()) return;
      if (response?.ok !== true) {
        if (response?.error) await publish({ feedback: response.error });
        await new Promise(resolve => setTimeout(resolve, 250));
      } else {
        const navigation = result.action.type === "click" || result.action.type === "search";
        const waitUntil = Date.now() + (navigation ? 8000 : 500);
        let observed = false;
        do {
          await new Promise(resolve => setTimeout(resolve, 150));
          if (!current()) return;
          const fresh = await page({ type: "GET_PAGE_CONTEXT" }, tabId);
          if (fresh && typeof fresh.url === "string" && (fresh.url !== beforeUrl || !navigation || `${fresh.title}\n${String(fresh.text).slice(0, 1000)}` !== beforeSignature)) { observed = true; break; }
        } while (Date.now() < waitUntil && current());
        if (!observed && navigation) {
          await publish({ feedback: "The page did not show a new result after that action, so I stopped rather than repeat it." });
          return;
        }
      }
    }
    if (current()) await publish({ feedback: "I stopped after eight steps. Say what you want me to do next." });
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
  lastActionSucceeded = false;
  if (!current()) return;
  if (state.privateInput && !["stop","pause"].includes(intent.type)) return;
  if (intent.type === "private-keyboard") { await page({type:"PAGE_ACTION",intent}); return; }
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
  if(intent.type === "activity-mode" || intent.type === "reading-command" || intent.type === "writing-command"){await activityAction(intent,current);lastActionSucceeded=true;return;}
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
  if (intent.type === "form-command") {
    if (intent.command.type !== "choose") tabChoices = [];
    if (intent.command.type === "choose" && tabChoices.length) {
      await action({ type: "choose", index: intent.command.index }, current);
      return;
    }
    const command = intent.command;
    if (("query" in command && command.query.length > 500) ||
        ("option" in command && command.option.length > 1000) ||
        ("value" in command && command.value.length > 10000)) {
      await publish({ feedback: "That form command is too long. Use a shorter field, answer, or option." });
      return;
    }
    const tabId = state.targetTabId;
    const revision = pageRevision;
    const result = await page({ type: "PAGE_ACTION", intent }, tabId);
    if (!current() || state.targetTabId !== tabId || pageRevision !== revision) return;
    if (typeof result?.dictating === "boolean") await publish({ dictating: result.dictating });
    if (result?.error) await publish({ feedback: result.error });
    return;
  }
  if (intent.type === "cancel") {
    ++planToken; planDestination=null;
    await page({type:"SITE_DIALOGUE",text:"cancel"});
    linkAuthorizationRevision++;
    tabChoices = [];
    await page({ type: "PAGE_ACTION", intent });
    await publish({ feedback: "Cancelled." });
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
    lastActionSucceeded = await tabAction(intent, current);
    return;
  }
  if (intent.type === "find") {
    const listed = await page({ type: "GET_TARGETS" });
    if (!current()) return;
    const matches = rankTargets(intent.query, Array.isArray(listed) ? listed : []);
    const result = await page({ type: "FIND_RESULT", ids: matches.ids });
    if (current() && result?.error) await publish({ feedback: result.error });
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
      if (current() && pageRevision === revision && state.running && !state.paused) { lastActionSucceeded = !results[0]?.result?.error; await publish({ feedback: results[0]?.result?.error || "Player updated." }); }
      return;
    }
  }
  const snapshotTab = state.targetTabId;
  const revision = pageRevision;
  const authorizationRevision = linkAuthorizationRevision;
  const stillCurrent = () => authorizationRevision === linkAuthorizationRevision && current() && state.running && !state.paused && !state.dictating && state.targetTabId === snapshotTab && pageRevision === revision;
  const result = await page({ type: "PAGE_ACTION", intent });
  lastActionSucceeded = result?.ok === true && !result?.error;
  if (intent.type === "site-action") {
    record(`site-${intent.action}`);
    // Site adapters return SiteResult.state rather than PAGE_ACTION's `ok`.
    // Keep that verified outcome so routines only capture successful actions.
    lastActionSucceeded = result?.state === "available" || result?.state === "already-satisfied";
    await siteResult(result, current);
    return;
  }
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
    lastActionSucceeded = true;
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
  if (state.privateInput) return;
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
    const routineAction = routineActionFromCommand(step.trim(), request);
    if (routineAction) await appendRoutineStep(routineAction);
  }
  if(valid())await publish({feedback:`Completed ${completed} verified steps.`});
}
async function chooseMode(mode:"reading"|"writing"|"browsing",automatic:boolean,reason:string){
  if(state.activityMode!==mode){activeProvider?.abort();pageRevision++;writingProposal=null;readingAudio="";}
  await publish({activityMode:mode,modeAutomatic:automatic,modeReason:reason,dictating:state.activityMode===mode?state.dictating:false,feedback:`${mode[0].toUpperCase()+mode.slice(1)} mode. ${reason}`});
  await pageState();
}
async function activityAction(intent:Extract<Intent,{type:"activity-mode"|"reading-command"|"writing-command"}>,current:()=>boolean){
  if(intent.type==="activity-mode"){
    if(intent.mode==="auto"){await publish({modeAutomatic:true,modeReason:"Automatic detection enabled."});await pageState();return;}
    await chooseMode(intent.mode,false,"Selected by you. Held until a clear new task.");
    if(intent.mode==="writing"){const context=await page({type:"MODE_CONTEXT"});if(context?.longEditor||context?.docs?.editable)await action({type:"start-typing"});else await publish({feedback:"Writing mode selected. Choose a supported long-form editor, then say start dictation."});}
    return;
  }
  if(intent.type==="reading-command"){
    if(state.activityMode!=="reading")await chooseMode("reading",false,"Reading command selected.");
    const tabId=state.targetTabId,revision=pageRevision;if(tabId===null)return;
    const valid=()=>state.running&&!state.paused&&state.targetTabId===tabId&&pageRevision===revision;
    if(intent.command.startsWith("zoom")){
      const tab=await chrome.tabs.get(tabId),before=await chrome.tabs.getZoom(tabId),saved=await chrome.tabs.getZoomSettings(tabId);
      if(!valid())return;
      if(intent.command==="zoom-restore"){
        if(!zoomRecord||zoomRecord.tabId!==tabId||zoomRecord.url!==tab.url||Math.abs(zoomRecord.after-before)>.001)throw new Error("The page or zoom changed. Your current zoom was preserved.");
        await chrome.tabs.setZoom(tabId,zoomRecord.before);await chrome.tabs.setZoomSettings(tabId,zoomRecord.settings);zoomRecord=null;
      }else{
        const value=intent.command==="zoom"?intent.value!:Math.round((before+(intent.command==="zoom-in"?.25:-.25))*100)/100;
        if(!Number.isFinite(value)||value<.5||value>3)throw new Error("Choose page zoom from 50 to 300 percent.");
        await chrome.tabs.setZoomSettings(tabId,{mode:"automatic",scope:"per-tab"});if(!valid())return;await chrome.tabs.setZoom(tabId,value);
        const after=await chrome.tabs.getZoom(tabId);if(Math.abs(after-value)>.001)throw new Error("The browser could not verify page zoom.");
        if(!zoomRecord||zoomRecord.tabId!==tabId||zoomRecord.url!==tab.url)zoomRecord={tabId,url:tab.url||"",before,after,settings:saved};else zoomRecord.after=after;
      }
      await publish({feedback:`Page zoom ${Math.round((await chrome.tabs.getZoom(tabId))*100)} percent.`});await pageState();return;
    }
    const result=await page({type:"PAGE_ACTION",intent});
    if(result?.complex){
      const abort=new AbortController();activeProvider=abort;
      try{const range=await resolveReadingRange(intent.text||"",result.text,groqOptions(),abort.signal);if(!valid())return;const selected=await page({type:"READ_SELECT",start:result.start+range.start,end:result.start+range.end,revision:result.revision});if(selected?.error)throw new Error(selected.error);await publish({feedback:"Highlighted the requested passage. Say read the selected passage."});}finally{if(activeProvider===abort)activeProvider=null;}
    }else if(result?.error)throw new Error(result.error);
    return;
  }
  if(intent.command==="verbatim"||intent.command==="cleaned"){await publish({writingVerbatim:intent.command==="verbatim",feedback:intent.command==="verbatim"?"Verbatim dictation. Cleanup is off.":"Cleaned dictation. Current segments may be processed by Groq."});return;}
  if(!state.dictating)throw new Error("Start dictation in the editor before using writing corrections.");
  if(intent.command==="paragraph"){const result=await page({type:"DICTATE",text:"\n\n"});if(result?.error)throw new Error(result.error);return;}
  const revision=pageRevision,tab=state.targetTabId;const valid=()=>revision===pageRevision&&state.targetTabId===tab&&state.running&&!state.paused&&state.dictating;
  if(intent.command==="readback"){const context=await page({type:"EDIT_CONTEXT"});if(!context?.text)throw new Error("No unchanged recent segment to read back.");await chrome.runtime.sendMessage({type:"SPEAK_FEEDBACK",text:context.text,enabled:true});return;}
  if(intent.command==="rewrite"){
    const context=await page({type:"EDIT_CONTEXT"});if(!context?.text)throw new Error("No unchanged recent segment to revise.");const abort=new AbortController();activeProvider=abort;
    try{const text=await cleanRamble(context.text,groqOptions(),abort.signal,intent.instruction);if(!valid())return;writingProposal={text,expected:context.expected,revision,binding:context.binding};await page({type:"TRANSCRIPT",text:`Proposed revision: ${text}`,final:true});await publish({feedback:"Revision preview ready. Say apply revision or cancel revision."});}finally{if(activeProvider===abort)activeProvider=null;}
    return;
  }
  const result=await page({type:"EDIT_APPLY",command:intent.command,from:intent.from,to:intent.to});if(result?.error)throw new Error(result.error);
}
/** Persist command state without retaining literal form answers or dictation. */
function storedTranscript(text: string): string {
  if (state.dictating) return "Dictation";
  const command = wakeRequest(text) ?? text.trim().replace(/^handsfree[, ]+/i, "");
  // Interim transcripts may contain an answer before its trailing field framing
  // arrives ("enter [answer] in ..."). Redact these prefixes as well.
  const formPrefix = /^(?:(?:could|can|would)\s+you\s+)?(?:please\s+)?(?:fill|enter|change|dictate|select|choose|check|uncheck|clear|open\s+form)\b/i;
  return parseFormCommand(command) || formPrefix.test(command) ? "Form command" : text;
}

async function routeHeard(text: string, parsed: Intent, revision: number) {
  const originalText = text;
  if(state.privateInput)return;
  if(parsed.type==="private-keyboard"){await action(parsed);return;}
  if (revision !== pageRevision || !state.running || state.paused) return;
  await publish({ lastHeard: storedTranscript(text), interimTranscript: "" });
  if (revision !== pageRevision || !state.running || state.paused) return;
  if(parsed.type==="activity-mode"||parsed.type==="reading-command"||parsed.type==="writing-command"){await activityAction(parsed,()=>revision===pageRevision);return;}
  if(state.activityMode==="reading" && (parsed.type==="choose" || parsed.type==="form-command"&&parsed.command.type==="choose")){
    const index=parsed.type==="choose"?parsed.index:(parsed as Extract<Intent,{type:"form-command"}>).command as {type:"choose";index:number};
    const response=await page({type:"PAGE_ACTION",intent:{type:"reading-command",command:"choose",text:String(typeof index==="number"?index:index.index)}});
    if(response?.ok)return;
  }
  if(state.activityMode==="reading" && parsed.type==="find"){await activityAction({type:"reading-command",command:"find",text:parsed.query},()=>revision===pageRevision);return;}
  if(/^cancel revision[.!?]?$/i.test(text.trim())){writingProposal=null;await publish({feedback:"Revision cancelled. Your draft was preserved."});return;}
  if(/^apply revision[.!?]?$/i.test(text.trim())){const p=writingProposal;if(!p||p.revision!==pageRevision)throw new Error("No current revision proposal.");const context=await page({type:"EDIT_CONTEXT"});if(context?.binding!==p.binding||context?.expected!==p.expected)throw new Error("The revision editor changed. Ask for the revision again.");writingProposal=null;const result=await page({type:"EDIT_APPLY",command:"revise",text:p.text,expected:p.expected});if(result?.error)throw new Error(result.error);return;}
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
    const context=await page({type:"EDIT_CONTEXT"});
    const verbatim=state.writingVerbatim||/^literal /i.test(text);
    let cleaned=literal;
    if(state.activityMode==="writing"&&!verbatim){
      const abort=new AbortController();activeProvider=abort;
      try{cleaned=await cleanRamble(literal,groqOptions(),abort.signal);}finally{if(activeProvider===abort)activeProvider=null;}
      if(revision!==pageRevision||!state.running||state.paused||!state.dictating)return;
      await page({type:"TRANSCRIPT",text:cleaned,final:true});
    }
    const result = await page({ type: "DICTATE", text: cleaned, ...(context?.binding!==undefined?{binding:context.binding,expected:context.expected}:{}) });
    if (result?.error) await publish({ feedback: result.error });
    return;
  }
  const current = () => revision === pageRevision && state.running && !state.paused;
  if (parsed.type === "routine-control") { await routineControl(parsed); return; }
  if(/^say that again[.!?]?$/i.test(text.trim())) {
    if(settings.spokenFeedback) await chrome.runtime.sendMessage({type:"SPEAK_FEEDBACK",text:state.feedback,enabled:true}).catch(()=>{});
    return;
  }
  if (isCancellation(text)) { await action({type:"cancel"},current); return; }
  const wake = wakeRequest(originalText);
  const wakeForm = wake === null ? null : parseFormCommand(wake);
  const formCommand = parsed.type === "form-command" ? parsed.command : wakeForm;
  if (formCommand?.type === "choose" && conversation?.site && !tabChoices.length) {
    // Site adapters own their numbered choices; generic forms are disabled there.
    parsed = { type: "choose", index: formCommand.index };
    text = `choose ${formCommand.index}`;
  } else if (formCommand) {
    await action({ type: "form-command", command: formCommand }, current);
    return;
  }
  // Explicit tab commands stay local even on sites with their own navigation rules.
  if (["new-tab", "next-tab", "previous-tab", "show-tabs", "indexed-tab", "close-tab"].includes(parsed.type)
    || parsed.type === "named-tab" && (!conversation?.site || /\btab\b/i.test(text))
    || parsed.type === "search" && (parsed.background || /\b(?:new|fresh|blank) tab\b/i.test(text))) {
    await voiceAction(text, parsed, current);
    return;
  }
  const openSite = /^(?:open|take me to) (wikipedia|github|reddit|amazon|spotify|netflix|youtube|chatgpt|chat gpt|ai chat|x|twitter|whatsapp|gmail|google meet|meet|linkedin|irctc|google maps|maps)$/i.exec(text.trim().replace(/[.!?]+$/,""));
  if (openSite) {
    const spokenSite = openSite[1].toLowerCase();
    const site = (spokenSite === "twitter" ? "x" : ["chat gpt", "ai chat"].includes(spokenSite) ? "chatgpt" : spokenSite.replace(/^google /, "")) as keyof typeof siteHomes;
    if (await needTabs() || !current()) return;
    const tab = await chrome.tabs.create({url:siteHomes[site]});
    if (tab.id !== undefined) await target(tab.id);
    if (tab.id !== undefined && state.targetTabId === tab.id) await appendRoutineStep({ type: "open-site", site });
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
    if(dialogue?.state) {
      await siteResult(dialogue,current);
      if (current() && ["available", "already-satisfied"].includes(dialogue.state)) {
        const step = routineActionFromCommand(text, parseSite(text, site) ?? parsed);
        if (step?.type === "media" || step?.type === "site-command") await appendRoutineStep(step);
      }
      return;
    }
    if((parsed.type==='pause'||parsed.type==='resume') && !['spotify','netflix'].includes(site.site) && !site.capabilities.some(c=>c.state==='available' && ['R24'].includes(c.id))) {await action(parsed,current);return;}
    // YouTube search and player commands keep their site semantics when
    // recorded; a background search remains an explicit browser command.
    if (site.site === "youtube" && !(parsed.type === "search" && parsed.background)) {
      const request = parseSite(text, site);
      if (request) { await voiceAction(text, request, current); return; }
    }
    const explicitBrowser=["new-tab","next-tab","previous-tab","close-tab","history","downloads","settings","incognito","back","forward","scroll","click","stop-typing","start-typing"].includes(parsed.type) || parsed.type==='named-tab' && /\btab\b/i.test(text);
    if(explicitBrowser) {await voiceAction(text,parsed,current);return;}
    const request = parseSite(text,site);
    if(request) { await voiceAction(text,request,current); return; }
    if(unsafeSpeech(text)) { await publish({feedback:'This is a question, commentary, negation or an excluded account operation. No page action was taken.'}); return; }
    if (/^(next|stop)$/i.test(text.trim())) { await publish({feedback:'Specify what to stop or advance, such as next episode or pause Handsfree.'}); return; }
  }
  if (wake !== null) {
    await arbitraryFind(originalText);
    return;
  }
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
  if (parsed.type !== "unknown" && !classifyNamed && (!site?.site || ["back","forward","scroll","new-tab","next-tab","previous-tab","named-tab","close-tab","choose","confirm","cancel","stop-typing","start-typing","click"].includes(parsed.type))) { await voiceAction(text,parsed); return; }
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
    if (intent.type === "unknown") {
      await publish({ feedback: `No command matched "${text}". Start arbitrary requests with "hey handsfree".` });
      return;
    }
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
  if (!trusted && !["SET_STATE", "METRIC", "PAUSE", "MODE_EVIDENCE", "DOCS_INPUT", "READING_AUDIO", "READING_PREFERENCES", "PRIVATE_INPUT", "PRIVATE_POPUP"].includes(message.type))
    return {
      ok: false,
      error: "This message is reserved for extension controls.",
    };
  if (state.privateInput && ["HEARD","TRANSCRIPT","UI_HEARD","UI_VOICE","UI_SPEAK","TRANSCRIBE_AUDIO","GESTURE_TRIGGER"].includes(message.type)) return {ok:false,error:"Voice is off during private entry. Leave the password field and choose Resume voice."};
  switch (message.type) {
    case "READING_PREFERENCES": {
      if(!internal&&(sender.frameId!==0||sender.tab?.id!==state.targetTabId))return {ok:false};
      if(message.value!==undefined){const value=readingPreferences(message.value);await chrome.storage.local.set({readingPreferences:value});return value;}
      return readingPreferences((await chrome.storage.local.get("readingPreferences")).readingPreferences);
    }
    case "MODE_EVIDENCE": {
      if(trusted||sender.frameId!==0||!state.running||state.paused||state.privateInput||!["browsing","reading","writing"].includes(message.mode)||![["writing","composition"],["reading","reading-interaction"],["browsing","navigation"]].some(([mode,reason])=>mode===message.mode&&reason===message.reason))return {ok:false};
      const evidenceRevision=pageRevision;
      const context=await page({type:"MODE_CONTEXT"});
      if(state.privateInput||evidenceRevision!==pageRevision||!state.running||state.paused)return {ok:false};
      if(message.mode==="writing"&&!context?.longEditor&&!(context?.docs?.editable&&context?.docs?.focused) || message.mode==="reading"&&!context?.reading)return {ok:false};
      if(state.activityMode!==message.mode)await chooseMode(message.mode,true,"Clear new task interaction.");
      if(message.mode==="writing"&&message.autoArm&&!state.dictating)await action({type:"start-typing"});return {ok:true};
    }
    case "READING_AUDIO": {if(sender.tab?.id!==state.targetTabId||sender.frameId!==0||!state.running||state.paused||state.privateInput||state.activityMode!=="reading")return {ok:false};readingAudio=message.active?String(message.text).slice(0,8000):"";return {ok:true};}
    case "DOCS_INPUT": {
      if(trusted||sender.frameId!==0||!state.running||state.paused||!state.dictating||state.activityMode!=="writing"||typeof message.text!=="string"||message.text.length>6000||!["insert","scratch","restore"].includes(message.command))return {ok:false};
      const tabId=state.targetTabId!,revision=pageRevision;const valid=()=>state.running&&!state.paused&&state.dictating&&state.activityMode==="writing"&&state.targetTabId===tabId&&revision===pageRevision;
      const context=await page({type:"EDIT_CONTEXT"});if(!valid()||!context?.docs||context.binding!==message.generation||context.expected!==message.expected)return {ok:false,error:"Docs editor context changed."};
      return docsInput(tabId,message.command,message.text,message.expected,message.url,valid);
    }
    case "PRIVATE_INPUT": {
      if (!internal && (sender.tab?.id !== state.targetTabId || (sender.frameId ?? 0) !== 0)) return {ok:false};
      if (message.command === "resume") {
        // Page-local controls verify focus before requesting this explicit exit.
        if(!privateReady)return {ok:false,error:"Wait for microphone shutdown before resuming voice."};
        if(nativeCredentialSession)return {ok:false,error:"Return to browser from the desktop panel before resuming voice."};
        if (!state.privateInput) return {ok:true};
        const token=privateRevision;
        const status=await page({type:"GET_PRIVATE_STATUS"});
        if(status?.ok!==true||status.active||status.focused)return {ok:false,error:"Finish private entry and leave the password field first."};
        if(token!==privateRevision || !privateReady)return {ok:false};
        await controller("private-exit",{privateRevision:token});
        if(token!==privateRevision || !privateReady)return {ok:false};
        await publish({privateInput:false,feedback:"Voice resumed."});await pageState();return {ok:true};
      }
      if (message.command !== "enter") return {ok:false};
      // Synchronous latch precedes the first await and invalidates every queued action.
      privateReady=false;const privateToken=++privateRevision;
      state.privateInput=true; state.lastHeard="";state.interimTranscript="";readingAudio="";writingProposal=null;
      activeProvider?.abort(); for (const request of transcriptionRequests) request.abort();
      ++pageRevision;++playbackToken;++planToken;planDestination=null;++narrationToken;chrome.tts?.stop();
      uiVoiceTab=null;uiVoiceUntil=0;
      if(routineSession.recording || routineSession.playing) await setRoutineSession({...routineSession,recordingPaused:routineSession.recording,playing:false,playbackPaused:routineSession.playing||routineSession.playbackPaused},"Routine paused for private entry.");
      await publish({privateInput:true,lastHeard:"",interimTranscript:"",dictating:false,voice:"Off — private entry"});
      const contexts=await chrome.runtime.getContexts({contextTypes:[chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]});
      if(contexts.length) {
        let timer:ReturnType<typeof setTimeout>|undefined;
        const ack=await Promise.race([chrome.runtime.sendMessage({type:"OFFSCREEN_COMMAND",command:"private-enter",privateSession,privateRevision}),new Promise<{ok:false;privateInput?:boolean}>(resolve=>{timer=setTimeout(()=>resolve({ok:false}),5000);})]).finally(()=>clearTimeout(timer));
        if(ack?.ok!==true || ack?.privateInput!==true) return {ok:false,error:"Microphone shutdown was not acknowledged. Keys remain locked."};
      }
      if(privateToken!==privateRevision)return {ok:false};
      privateReady=true;await pageState();return {ok:true,privateInput:true};
    }
    case "PRIVATE_POPUP": {
      if(!state.privateInput || !privateReady || !state.running || state.paused || !await paired())return {ok:false,error:"Start Handsfree, then connect and calibrate the macOS desktop companion first."};
      if(!internal && (sender.tab?.id!==state.targetTabId || (sender.frameId??0)!==0))return {ok:false};
      if(message.command!=="start")return {ok:false};
      if(nativeCredentialSession)return {ok:false,error:"Password popup control is already active."};
      nativeCredentialSession=true;
      const revision=++captureRevision;
      if(captureChecks.size){nativeCredentialSession=false;return {ok:false,error:"Finish device permission setup before controlling password popups."};}
      try {
      await controller("stop");
      const contexts=await chrome.runtime.getContexts({contextTypes:[chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]});
      if(contexts.length)await chrome.offscreen.closeDocument();
      await releaseDesktop();
        await startCredentialControl(()=>{
          nativeCredentialSession=false;
          if(revision!==captureRevision||!state.running)return;
          void controller("start").then(()=>publish({feedback:"Returned to browser. Microphone remains off until you choose Resume voice."})).catch(()=>stop());
        });
        await publish({camera:"Desktop password popup control",voice:"Off — private entry",feedback:"Use the Mac pointer to choose your saved login. Choose Return to browser in the desktop panel when finished."});
        return {ok:true};
      }catch(error){nativeCredentialSession=false;await publish({feedback:error instanceof Error?error.message:"Desktop popup control unavailable. Microphone remains off."});await controller("start");return {ok:false,error:state.feedback};}
    }
    case "DESKTOP_CONNECT": return connectDesktop();
    case "DESKTOP_DISCONNECT": await stop();await disconnectDesktop();return {ok:true};
    case "DESKTOP_STATUS":return {paired:await paired()};
    case "PREPARE_BROWSER_CAPTURE":if(state.privateInput)return {ok:false,error:"Finish private entry before checking device access."};await claimDesktop();return {ok:true};
    case "UI_VOICE": {
      if (!dashboard || sender.tab?.id === undefined) return {ok:false,error:"Open the connected dashboard to use setup voice."};
      if (!message.enabled) {
        if (uiVoiceTab === sender.tab.id) { uiVoiceTab = null; uiVoiceUntil = 0; await controller("ui-stop"); }
        return {ok:true};
      }
      if (!await activeDashboard(sender.tab.id)) return {ok:false,error:"Return to the dashboard to use setup voice."};
      if (mediaPermissions.microphone !== "granted") return {ok:false,error:"Allow microphone access in Permissions, then choose Listen for setup commands."};
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
    case "GET_ROUTINE_SESSION":
      return routineSession;
    case "GET_ROUTINES":
      return getRoutines();
    case "SAVE_ROUTINE": {
      const name = typeof message.name === "string" ? message.name.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
      if (!name || name.length > 60) return { ok: false, error: "Choose a routine name from 1 to 60 characters." };
      if (!validRoutineSteps(message.steps) || !message.steps.length) return { ok: false, error: "A routine needs 1–20 supported steps. Review or remove any invalid step." };
      const routines = await getRoutines();
      const existing = message.id ? routines.find(routine => routine.id === message.id) : undefined;
      if (message.id && !existing) return { ok: false, error: "That saved routine no longer exists. Refresh this dashboard and try again." };
      if (routines.some(routine => routine.id !== existing?.id && routine.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return { ok: false, error: "A routine already uses that name. Choose a different name." };
      if (!existing && routines.length >= 20) return { ok: false, error: "You can save up to 20 routines. Delete one before adding another." };
      const now = Date.now();
      const saved: VoiceRoutine = { id: existing?.id || `routine-${now}-${++routineIdCounter}`, name, steps: message.steps, createdAt: existing?.createdAt || now, updatedAt: now };
      const next = existing ? routines.map(routine => routine.id === existing.id ? saved : routine) : [...routines, saved];
      await chrome.storage.local.set({ voiceRoutines: next });
      if (existing) await publish({ feedback: `Updated routine “${name}” with ${saved.steps.length} steps.` });
      else await setRoutineSession({ ...routineSession, recording: false, recordingPaused: false, draft: [] }, `Saved routine “${name}” with ${saved.steps.length} steps.`);
      return saved;
    }
    case "DISCARD_ROUTINE_DRAFT":
      await setRoutineSession({ ...routineSession, recording: false, recordingPaused: false, draft: [] }, "Routine draft discarded.");
      return { ok: true };
    case "DELETE_ROUTINE": {
      const routines = await getRoutines();
      if (!routines.some(routine => routine.id === message.id)) return { ok: false, error: "That routine was already deleted." };
      await chrome.storage.local.set({ voiceRoutines: routines.filter(routine => routine.id !== message.id) });
      if (routineSession.playbackRoutineId === message.id) {
        ++playbackToken;
        await setRoutineSession({ ...routineSession, playing: false, playbackPaused: false, playbackRoutineId: null, playbackStep: 0 }, "The routine being played was deleted. Playback stopped.");
      }
      return { ok: true };
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
      const labels: Record<string, string> = { wikipedia: "Wikipedia", github: "GitHub", reddit: "Reddit", amazon: "Amazon", spotify: "Spotify", netflix: "Netflix", youtube: "YouTube", chatgpt: "ChatGPT", x: "X", whatsapp: "WhatsApp Web", gmail: "Gmail", meet: "Google Meet", linkedin: "LinkedIn Jobs", irctc: "IRCTC", maps: "Google Maps" };
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
      const request=new AbortController();transcriptionRequests.add(request);
      let text="";
      try { text=await transcribeAudio(new Blob([new Uint8Array(message.audio)], {type:message.mime}), {...groqOptions(),language:settings.language}, AbortSignal.any([request.signal,AbortSignal.timeout(12000)])); }
      finally {transcriptionRequests.delete(request);}
      if(state.privateInput || request.signal.aborted)return {text:""};
      return { text: revision === pageRevision && (state.running || setupActive && uiVoiceTab === uiTab && Date.now() <= uiVoiceUntil && await activeDashboard(uiTab!)) ? text : "" };
    }
    case "TRANSCRIPT":
      if (state.running && !state.paused) {
        const transcript = storedTranscript(message.text);
        await publish(message.final ? { lastHeard: transcript, interimTranscript: "" } : { interimTranscript: transcript }, message.final);
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
        ? Object.fromEntries(Object.entries(message.patch).filter(([key])=>key!=="privateInput")) as Partial<SessionState>
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
      if(readingAudio){
        const allowed=/^(?:pause reading|resume reading|stop reading aloud|read slower|read faster|pause handsfree|stop handsfree)$/;
        if(!allowed.test(normalized)||readingAudio.toLowerCase().includes(normalized))return {ok:true};
      }
      if(state.dictating&&parseIntent(message.text).type==="stop-typing"){activeProvider?.abort();pageRevision++;writingProposal=null;await action({type:"stop-typing"});return {ok:true};}
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
      const wake = wakeRequest(message.text);
      const wakeForm = wake === null ? null : parseFormCommand(wake);
      const intent: Intent = wakeForm ? { type: "form-command", command: wakeForm } : parseIntent(message.text);
      if (["cancel", "pause", "stop"].includes(intent.type)) linkAuthorizationRevision++;
      // Typing transitions remain serialized. A click can cancel slow provider
      // work only when no earlier transcript may enter or leave dictation.
      if (
        activeProvider && !state.dictating && pendingTypingCommands === 0 &&
        (intent.type === "form-command" && intent.command.type !== "dictate" ||
          ["click", "open", "click-target", "click-link", "focus-target", "show-links", "pause", "stop", "cancel"].includes(intent.type))
      ) {
        const provider = activeProvider;
        urgentCommand = urgentCommand.then(() => routeHeard(message.text, intent, revision));
        provider.abort();
        await urgentCommand;
        return { ok: true };
      }
      const typing = intent.type === "start-typing" || intent.type === "stop-typing" || intent.type === "form-command" && intent.command.type === "dictate";
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
      activeProvider?.abort();
      pageRevision++;
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
    tabChoices = [];
    activeProvider?.abort();
    pageRevision++;
    if (state.running) await pause();
  });
});

onDesktopLost(()=>{void stop().then(()=>publish({feedback:"Desktop disconnected. Browser capture stopped. Open Handsfree and reconnect."}));});

chrome.runtime.onConnect?.addListener(port=>{
  if(port.name!=="handsfree-capture-check")return;
  if(!port.sender||!uiSender(port.sender)){port.disconnect();return;}
  let active=true;captureChecks.add(port);
  port.onDisconnect.addListener(()=>{active=false;captureChecks.delete(port);void releaseIdleDesktop();});
  port.onMessage.addListener(message=>{if(!message?.release)return;captureChecks.delete(port);void releaseIdleDesktop().finally(()=>{if(active)port.postMessage({released:true});});});
  void ready.then(()=>{if(state.privateInput)throw new Error("Finish private entry before checking device access.");return claimDesktop();}).then(()=>{if(active)port.postMessage({ok:true});else void releaseIdleDesktop();}).catch(error=>{if(active)port.postMessage({ok:false,error:error instanceof Error?error.message:String(error)});});
});
