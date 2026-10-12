export interface MeetRuntimeContext {tabId:number;documentId:string;code:string;pageRevision:number;nonce:string}
import type { MeetPreferences, CaptionLine } from "./meet/model";
import type { SiteRequest, SiteSnapshot } from "./sites/types";
export type ActivityMode = "browsing" | "reading" | "writing";
export type PointerMode = "face" | "hand";
export type InputMethod = "voice" | PointerMode;
export interface Settings {
  /** null identifies preferences saved before independent input selection. */
  enabledInputs: InputMethod[] | null;
  onboardingStep: number;
  onboardingCompleted: boolean;
  setupGuidance: "ask" | "voice" | "silent";
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
  setupGuidance: "ask",
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
    setupGuidance: next.setupGuidance === "voice" || next.setupGuidance === "silent" ? next.setupGuidance : "ask",
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
  /** Ranges on the positive and negative camera axes, for mirrored inputs. */
  positiveX?: number;
  negativeX?: number;
  positiveY?: number;
  negativeY?: number;
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
  holdMs?:number;cooldownMs?:number;
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
export interface MeetPoseStatus {pose:import("../../shared/tracking/pose").HeadPose|null;stage?:string;calibration?:{gesture:import("./meet/model").HeadGesture;neutral:number;threshold:number;direction:1|-1};error?:string}
export interface PointerSample {
  meetGestureHeld?:boolean;
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
  activityMode: ActivityMode;
  modeAutomatic: boolean;
  modeReason: string;
  writingVerbatim: boolean;
  privateInput: boolean;
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
  activityMode: "browsing", modeAutomatic: true, modeReason: "Choose a task or use automatic detection.", writingVerbatim: false,
  privateInput: false,
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
export interface WhatsAppRoutineMessage {
  recipient: { identity: string; label: string };
  text: string;
}
export type RoutineAction =
  | { type: "open-site"; site: keyof typeof import("./sites/catalogue").siteHomes }
  | { type: "search"; query: string; background: boolean }
  | { type: "switch-tab"; intent: { type: "indexed-tab"; index: number } | { type: "named-tab"; name: string } }
  | { type: "click-target"; query: string }
  | { type: "scroll"; direction: "up" | "down" | "top" | "bottom" }
  | { type: "media"; command: "play" | "pause" | "toggle" }
  | { type: "site-command"; site: "youtube"; action: Extract<import("./sites/types").ActionId, "YT01" | "YT03" | "YT04" | "YT05" | "YT06" | "YT07" | "YT08" | "YT09" | "YT11" | "YT12">; args: import("./sites/types").SiteArgs }
  | { type: "site-command"; site: "whatsapp"; action: "WA01"; args: import("./sites/types").SiteArgs }
  | ({ type: "whatsapp-message" } & WhatsAppRoutineMessage)
  | { type: "navigate"; direction: "back" | "forward" };
export interface RoutineStep { id: string; label: string; action: RoutineAction }
export interface VoiceRoutine { id: string; name: string; steps: RoutineStep[]; createdAt: number; updatedAt: number }
export interface RoutineSession {
  recording: boolean; recordingPaused: boolean; draft: RoutineStep[];
  playing: boolean; playbackPaused: boolean; playbackRoutineId: string | null;
  playbackStep: number; feedback: string;
}
export const emptyRoutineSession: RoutineSession = {
  recording: false, recordingPaused: false, draft: [], playing: false,
  playbackPaused: false, playbackRoutineId: null, playbackStep: 0, feedback: "",
};
/** Explicit page-local form operations; answers must never be provider input. */
export type FormCommand =
  | { type: "list-forms" }
  | { type: "select-form"; query: string }
  | { type: "select-form"; index: number }
  | { type: "list-fields" }
  | { type: "list-required" }
  | { type: "fill"; query: string; value: string }
  | { type: "change"; query: string; value: string }
  | { type: "dictate"; query: string }
  | { type: "select-option"; query: string; option: string }
  | { type: "check"; query: string }
  | { type: "uncheck"; query: string }
  | { type: "clear"; query: string }
  | { type: "choose"; index: number }
  | { type: "missing" }
  | { type: "review" }
  | { type: "next-section" }
  | { type: "previous-section" }
  | { type: "submit" };
export type Intent =
  | { type: "activity-mode"; mode: ActivityMode | "auto" }
  | { type: "reading-command"; command: string; text?: string; value?: number }
  | { type: "writing-command"; command: "scratch" | "restore" | "sentence" | "paragraph" | "replace" | "rewrite" | "verbatim" | "cleaned" | "readback"; from?: string; to?: string; instruction?: string }
  | { type: "private-keyboard" }
  | { type: "routine-control"; command: "start-recording" | "pause-recording" | "resume-recording" | "undo-step" | "stop-recording" | "list" | "run" | "pause-playback" | "resume-playback" | "stop-playback"; name?: string }
  | { type: "form-command"; command: FormCommand }
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
export type AgentAction =
  | { type: "click"; targetId: string }
  | { type: "search"; targetId: string; query: string }
  | { type: "scroll"; direction: "up" | "down" | "top" | "bottom" }
  | { type: "media"; command: "play" | "pause" };
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
  | { type: "READING_AUDIO"; active: boolean; text: string }
  | { type: "MODE_EVIDENCE"; mode: ActivityMode; reason: "composition" | "reading-interaction" | "navigation"; autoArm?: boolean }
  | { type: "MODE_CONTEXT" }
  | { type: "EDIT_CONTEXT" }
  | { type: "EDIT_APPLY"; command: string; text?: string; from?: string; to?: string; expected?: string }
  | { type: "READ_SELECT"; start: number; end: number; revision: string }
  | { type: "DOCS_INPUT"; text: string; command: "insert" | "scratch" | "restore"; expected: string; url: string; generation: number }
  | {type:"MEET_PAGE_CHANGED";documentId:string;code:string;active:boolean}
  | {type:"MEET_RUNTIME";context:MeetRuntimeContext|null;preferences:MeetPreferences}
  | {type:"MEET_GESTURE_TRIGGER";context:MeetRuntimeContext;gesture:string;inputKind:"face"|"hand"}
  | {type:"MEET_HEAD_CALIBRATE";gesture:import("./meet/model").HeadGesture}
  | {type:"MEET_HEAD_CANCEL"}
  | {type:"GET_MEET_POSE"}
  | {type:"MEET_POSE_STATUS";status:MeetPoseStatus}
  | { type: "GET_MEET_STATUS" }
  | { type: "SAVE_MEET_PREFERENCES"; preferences: MeetPreferences }
  | { type: "MEET_CONTROL"; command: "start-transcript"|"stop-transcript"|"start-signing"|"stop-signing" }
  | { type: "MEET_PAGE_STATUS" }
  | { type: "MEET_CAPTURE"; sessionId:string; documentId:string; command:"start"|"stop"|"cancel" }
  | { type: "MEET_CAPTIONS"; sessionId:string; documentId:string; sequence:number; lines:CaptionLine[]; status?:string }
  | { type: "MEET_TRANSCRIPT_EXPORT"; id:string }
  | { type: "MEET_TRANSCRIPT_READ"; id:string }
  | { type: "MEET_TRANSCRIPT_DELETE"; id:string; confirmed:boolean }
  | {type:"GET_PRIVATE_STATUS"}
  | { type: "PRIVATE_INPUT"; command: "enter" | "resume" }
  | { type: "PRIVATE_POPUP"; command: "start" | "return" }
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
  | { type: "READING_PREFERENCES"; value?: import("./reading/model").ReadingPreferences }
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
  | { type: "OFFSCREEN_COMMAND"; command: "private-enter" | "private-exit" | "start" | "pause" | "resume" | "stop" | "calibrate" | "settings" | "install-speech" | "ui-start" | "ui-stop" | "narration-start" | "narration-end" | "gesture-calibrate" | "gesture-cancel-calibration" | "gesture-presets"; privateSession?:string; privateRevision?:number; settings?: Settings; gesture?: HandGesture; presets?: GesturePreset[] }
  | { type: "GET_GESTURE_PRESETS" }
  | { type: "SAVE_GESTURE_PRESETS"; presets: GesturePreset[] }
  | { type: "GET_ROUTINE_SESSION" }
  | { type: "GET_ROUTINES" }
  | { type: "SAVE_ROUTINE"; id?: string; name: string; steps: RoutineStep[] }
  | { type: "DISCARD_ROUTINE_DRAFT" }
  | { type: "DELETE_ROUTINE"; id: string }
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
      activityMode?: ActivityMode;
      modeAutomatic?: boolean;
      privateInput?: boolean;
      running: boolean;
      paused: boolean;
      dictating: boolean;
      settings: Settings;
    }
  | { type: "PAGE_ACTION"; intent: Intent }
  | { type: "GET_WHATSAPP_DRAFT" }
  | { type: "RUN_WHATSAPP_MESSAGE"; message: WhatsAppRoutineMessage; requestId: string }
  | { type: "AGENT_ACTION"; action: AgentAction }
  | { type: "DICTATE"; text: string; binding?: number; expected?: string }
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
