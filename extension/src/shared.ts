import type { SiteRequest, SiteSnapshot } from "./sites/types";
export type PointerMode = "face" | "hand";
export type InputMethod = "voice" | PointerMode;
export interface Settings {
  /** null identifies preferences saved before independent input selection. */
  enabledInputs: InputMethod[] | null;
  onboardingStep: number;
  onboardingCompleted: boolean;
  voiceOnly: boolean;
  spokenFeedback: boolean;
  testWriteTargets: string[];
  testMessageRecipients: string[];
  sensitivity: number;
  handSensitivity: number;
  pausePhrase: string;
  resumePhrase: string;
  scrollSensitivity: number;
  cursorStyle: "circle" | "arrow" | "crosshair" | "spark";
  dwellMs: number;
  deadZone: number;
  confidenceThreshold: number;
  pointerMode: PointerMode;
  dwellEnabled: boolean;
  edgeScroll: boolean;
  speechMode: "local" | "browser";
  language: string;
  llmKey: string;
  llmModel: string;
  dashboardUrl: string;
  groqModel: string;
  jevProvider: "typesafe" | "openrouter";
}
export const defaults: Settings = {
  enabledInputs: null,
  onboardingStep: 0,
  onboardingCompleted: false,
  voiceOnly: false,
  spokenFeedback: false,
  testWriteTargets: [],
  testMessageRecipients: [],
  sensitivity: 1,
  handSensitivity: 1.6,
  pausePhrase: "pause handsfree",
  resumePhrase: "resume handsfree",
  scrollSensitivity: 1,
  cursorStyle: "circle",
  dwellMs: 800,
  deadZone: 0.035,
  confidenceThreshold: 0.7,
  pointerMode: "face",
  dwellEnabled: true,
  edgeScroll: true,
  speechMode: "browser",
  language: "en-US",
  llmKey: "",
  llmModel: "gpt-4.1-mini",
  dashboardUrl: "http://localhost:3000/dashboard",
  groqModel: "qwen/qwen3.8-27b",
  jevProvider: "openrouter",
};
export function inputMethods(settings: Pick<Settings, "enabledInputs" | "voiceOnly" | "pointerMode">): InputMethod[] {
  if (Array.isArray(settings.enabledInputs) && settings.enabledInputs.length)
    return settings.enabledInputs;
  return settings.voiceOnly ? ["voice"] : ["voice", settings.pointerMode];
}
export function voiceEnabled(settings: Settings): boolean {
  return inputMethods(settings).includes("voice");
}
/** Apply the same finite bounds to old saved controls and new dashboard settings. */
export function normalizeControlSettings(value: Partial<Settings>): Settings {
  const next = { ...defaults, ...value };
  const bounded = (n: unknown, minimum: number, maximum: number, fallback: number) =>
    typeof n === "number" && Number.isFinite(n) ? Math.max(minimum, Math.min(maximum, n)) : fallback;
  const phrase = (value: unknown, fallback: string) => {
    if (typeof value !== "string" || value.length > 80) return fallback;
    return value.normalize("NFKC").toLowerCase().trim().replace(/[.!?,;:]+$/g, "").replace(/\s+/g, " ") || fallback;
  };
  const pausePhrase = phrase(next.pausePhrase, defaults.pausePhrase);
  const resumePhrase = phrase(next.resumePhrase, defaults.resumePhrase);
  const selected = Array.isArray(value.enabledInputs)
    ? [...new Set(value.enabledInputs.filter((method): method is InputMethod => ["voice", "face", "hand"].includes(method))) ]
    : inputMethods(next);
  const enabledInputs: InputMethod[] = selected.length ? selected : ["voice"];
  const pointerMode = enabledInputs.includes(next.pointerMode) ? next.pointerMode
    : enabledInputs.includes("face") ? "face" : enabledInputs.includes("hand") ? "hand" : next.pointerMode === "hand" ? "hand" : "face";
  return {
    ...next,
    enabledInputs,
    onboardingStep: Math.round(bounded(next.onboardingStep, 0, 2, 0)),
    onboardingCompleted: next.onboardingCompleted === true,
    testWriteTargets: Array.isArray(next.testWriteTargets) ? next.testWriteTargets.filter((value): value is string => typeof value === "string" && /^https:\/\/(?:github\.com\/[^/]+\/[^/?#]+|(?:www\.)?reddit\.com\/r\/[^/?#]+|x\.com\/[^/]+\/status\/\d+)\/?$/.test(value)).slice(0,5) : [],
    testMessageRecipients: Array.isArray(next.testMessageRecipients) ? [...new Set(next.testMessageRecipients.filter((entry): entry is string => typeof entry === "string" && /^(?:gmail:[^\s@]+@[^\s@]+\.[^\s@]+|whatsapp:[^\n]{1,100}|meet:[a-z]{3}-[a-z]{4}-[a-z]{3})$/.test(entry)).map(entry => entry.toLowerCase().trim()))].slice(0,20) : [],
    voiceOnly: !enabledInputs.includes("face") && !enabledInputs.includes("hand"),
    spokenFeedback: typeof next.spokenFeedback === "boolean" ? next.spokenFeedback : false,
    sensitivity: bounded(next.sensitivity, 0.2, 6, defaults.sensitivity),
    handSensitivity: bounded(next.handSensitivity, 0.2, 6, defaults.handSensitivity),
    pausePhrase,
    resumePhrase: resumePhrase === pausePhrase ? pausePhrase === defaults.resumePhrase ? "resume" : defaults.resumePhrase : resumePhrase,
    dwellMs: bounded(next.dwellMs, 400, 5000, defaults.dwellMs),
    scrollSensitivity: bounded(next.scrollSensitivity, 0.2, 3, defaults.scrollSensitivity),
    cursorStyle: ["circle", "arrow", "crosshair", "spark"].includes(next.cursorStyle) ? next.cursorStyle : "circle",
    deadZone: bounded(next.deadZone, 0, 0.3, defaults.deadZone),
    confidenceThreshold: bounded(next.confidenceThreshold, 0.5, 0.95, defaults.confidenceThreshold),
    dwellEnabled: typeof next.dwellEnabled === "boolean" ? next.dwellEnabled : defaults.dwellEnabled,
    edgeScroll: typeof next.edgeScroll === "boolean" ? next.edgeScroll : defaults.edgeScroll,
    pointerMode,
    speechMode: next.speechMode === "local" ? "local" : "browser",
  };
}
export interface Calibration {
  neutralX: number;
  neutralY: number;
  rangeX: number;
  rangeY: number;
  left?: number;
  right?: number;
  up?: number;
  down?: number;
  /** Direction of the camera coordinates can differ across mirrored camera paths. */
  invertX?: boolean;
  invertY?: boolean;
}
export type HandGesture = "index" | "two-fingers" | "three-fingers" | "fist" | "thumbs-up";
export type GestureCalibration = { threshold: number; calibratedAt: number };
export type GestureAction =
  | { type: "open-site"; destinationId: string; url: string; inNewTab: boolean }
  | { type: "media-toggle" | "media-play" | "media-pause" }
  | { type: "back" | "forward" | "next-tab" | "previous-tab" | "scroll-top" | "scroll-bottom" };
export interface GesturePreset {
  id: string;
  name: string;
  gesture: HandGesture;
  action: GestureAction;
  calibration: GestureCalibration;
  enabled: boolean;
}
export interface GestureRuntimeStatus {
  ready: boolean;
  detected: HandGesture | null;
  confidence: number;
  calibrating?: HandGesture | null;
  calibrationProgress?: number;
  calibration?: GestureCalibration;
  error?: string;
}
export interface PointerSample {
  x: number;
  y: number;
  confidence: number;
  timestamp: number;
  source: PointerMode;
  handHold: boolean;
  fps: number;
  latencyMs: number;
}
export interface SessionState {
  voiceOnly: boolean;
  running: boolean;
  paused: boolean;
  dictating: boolean;
  targetTabId: number | null;
  camera: string;
  voice: string;
  lastHeard: string;
  feedback: string;
  confidence: number;
  fps: number;
  latencyMs: number;
  trackingBackend: string;
  interimTranscript: string;
  calibrationProgress: number | null;
  calibrationStage: string;
  calibrationSnapshots: Record<string, string>;
}
export const initialState: SessionState = {
  voiceOnly: false,
  running: false,
  paused: false,
  dictating: false,
  targetTabId: null,
  camera: "Off",
  voice: "Off",
  lastHeard: "",
  feedback: "Open a webpage, then start Handsfree.",
  confidence: 0,
  fps: 0,
  latencyMs: 0,
  trackingBackend: "Not started",
  interimTranscript: "",
  calibrationProgress: null,
  calibrationStage: "",
  calibrationSnapshots: {},
};
export type LinkDisposition = "new-tab" | "background";
export type Intent =
  | {type:"upload-file"}
  | { type: "switch-pointer"; mode: PointerMode }
  | SiteRequest
  | { type: "scroll"; direction: "up" | "down" | "top" | "bottom" }
  | { type: "media-seek"; seconds: number }
  | {
      type:
        | "back"
        | "forward"
        | "click"
        | "open"
        | "start-typing"
        | "stop-typing"
        | "submit"
        | "pause"
        | "resume"
        | "stop"
        | "confirm"
        | "cancel"
        | "new-tab"
        | "next-tab"
        | "previous-tab"
        | "show-tabs"
        | "close-tab"
        | "incognito"
        | "history"
        | "downloads"
        | "settings"
        | "media-play"
        | "media-pause"
        | "media-toggle";
    }
  | { type: "search"; query: string; background: boolean }
  | { type: "indexed-tab"; index: number }
  | { type: "named-tab"; name: string }
  | { type: "find"; query: string }
  | { type: "click-target"; query: string; disposition?: LinkDisposition }
  | { type: "click-link"; index: number; disposition?: LinkDisposition }
  | { type: "focus-target"; query: string }
  | { type: "show-links" }
  | { type: "choose"; index: number }
  | { type: "unknown"; heard: string };
export interface PageContext {
  title: string;
  url: string;
  text: string;
}
export interface TargetText {
  id: string;
  text: string;
  role: string;
}
export interface MetricEvent {
  at: number;
  type: string;
  detail?: string;
  value?: number;
}
export interface PermissionState {
  pages: boolean;
  tabs: boolean;
  provider: boolean;
  camera: PermissionStateValue;
  microphone: PermissionStateValue;
}
export type PermissionStateValue = "granted" | "denied" | "prompt" | "unknown";
export type Message =
  | { type: "UI_VOICE"; enabled: boolean }
  | { type: "UI_HEARD"; text: string }
  | { type: "UI_SPEAK"; text: string }
  | { type: "GET_SITE_CONTEXT" }
  | { type: "SITE_DIALOGUE"; text: string }
  | { type: "SPEAK_FEEDBACK"; text: string; enabled: boolean }
  | { type: "GET_PERMISSIONS" }
  | { type: "REVOKE_PERMISSION"; kind: "pages" | "tabs" }
  | { type: "MEDIA_PERMISSIONS"; camera: PermissionStateValue; microphone: PermissionStateValue }
  | {type:"DESKTOP_CONNECT"|"DESKTOP_DISCONNECT"|"DESKTOP_STATUS"|"PREPARE_BROWSER_CAPTURE"}
  | { type: "GET_STATE" }
  | { type: "GET_SETTINGS" }
  | { type: "OPEN_DASHBOARD"; tabId?: number; hash?: string }
  | { type: "GET_TABS" }
  | { type: "ACTIVATE_TAB"; id: number }
  | { type: "GET_PROVIDER_STATUS" }
  | { type: "SAVE_PROVIDERS"; groqKeys?: string[]; jevKey?: string; jevKeys?: string[] }
  | { type: "SET_DASHBOARD_URL"; url: string }
  | { type: "GRANT_PERMISSIONS"; kind: "pages" | "tabs" | "provider" | "devices"; camera?: boolean; microphone?: boolean; returnHash?: string }
  | { type: "INSTALL_SPEECH_PACK"; returnHash?: "#setup" | "#preferences" }
  | { type: "TRANSCRIPT"; text: string; final: boolean }
  | { type: "TRANSCRIBE_AUDIO"; audio: number[]; mime: string; language: string }
  | { type: "GET_CALIBRATION"; mode: PointerMode }
  | { type: "SAVE_CALIBRATION"; mode: PointerMode; calibration: Calibration }
  | { type: "OFFSCREEN_COMMAND"; command: "start" | "pause" | "resume" | "stop" | "calibrate" | "settings" | "install-speech" | "ui-start" | "ui-stop" | "narration-start" | "narration-end" | "gesture-calibrate" | "gesture-cancel-calibration" | "gesture-presets"; settings?: Settings; gesture?: HandGesture; presets?: GesturePreset[] }
  | { type: "GET_GESTURE_PRESETS" }
  | { type: "SAVE_GESTURE_PRESETS"; presets: GesturePreset[] }
  | { type: "GET_GESTURE_DESTINATIONS" }
  | { type: "GET_GESTURE_STATUS" }
  | { type: "CALIBRATE_GESTURE"; gesture: HandGesture }
  | { type: "CANCEL_GESTURE_CALIBRATION" }
  | { type: "GESTURE_STATUS"; status: GestureRuntimeStatus }
  | { type: "GESTURE_TRIGGER"; presetId: string }
  | { type: "GESTURE_PREVIEW_FRAME"; frame: string | null }
  | { type: "GET_GESTURE_PREVIEW" }
  | { type: "SAVE_SETTINGS"; settings: Settings }
  | { type: "OPEN_CONTROLLER"; tabId?: number }
  | { type: "START"; tabId?: number }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "STOP" }
  | { type: "SET_STATE"; patch: Partial<SessionState> }
  | { type: "STATE"; state: SessionState }
  | { type: "POINTER"; sample: PointerSample }
  | { type: "HEARD"; text: string }
  | { type: "ACTION"; intent: Intent }
  | {
      type: "PAGE_STATE";
      running: boolean;
      paused: boolean;
      dictating: boolean;
      settings: Settings;
    }
  | { type: "PAGE_ACTION"; intent: Intent }
  | { type: "DICTATE"; text: string }
  | { type: "GET_TARGETS" }
  | { type: "VALIDATE_LINK"; id: string; url: string; pageUrl: string }
  | { type: "GET_PAGE_CONTEXT" }
  | { type: "ANSWER"; text: string }
  | { type: "FIND_RESULT"; ids: string[]; disposition?: LinkDisposition }
  | { type: "METRIC"; event: MetricEvent }
  | { type: "GET_LOGS" }
  | { type: "CLEAR_LOGS" }
  | {
      type: "CONTROLLER_COMMAND";
      command: "pause" | "resume" | "stop" | "start" | "calibrate";
    }
  | { type: "RECALIBRATE" };
export async function send<T = any>(message: Message): Promise<T> {
  const runtime = (globalThis as typeof globalThis & { chrome: { runtime: { sendMessage(message: Message): Promise<any> } } }).chrome.runtime;
  const result = await runtime.sendMessage(message);
  if (result?.ok === false) throw new Error(result.error || "The action failed. Retry from the popup.");
  return result;
}
