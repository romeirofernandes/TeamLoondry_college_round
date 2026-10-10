export type PointerMode = "face" | "hand";
export interface Settings {
  sensitivity: number;
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
  sensitivity: 1,
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
export interface Calibration {
  neutralX: number;
  neutralY: number;
  rangeX: number;
  rangeY: number;
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
}
export const initialState: SessionState = {
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
};
export type Intent =
  | { type: "scroll"; direction: "up" | "down" }
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
        | "close-tab"
        | "incognito"
        | "history"
        | "downloads"
        | "settings";
    }
  | { type: "search"; query: string; background: boolean }
  | { type: "named-tab"; name: string }
  | { type: "find"; query: string }
  | { type: "choose"; index: number }
  | { type: "unknown"; heard: string };
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
export type Message =
  | { type: "GET_STATE" }
  | { type: "GET_SETTINGS" }
  | { type: "OPEN_DASHBOARD"; tabId?: number; hash?: string }
  | { type: "GET_TABS" }
  | { type: "ACTIVATE_TAB"; id: number }
  | { type: "GET_PROVIDER_STATUS" }
  | { type: "SAVE_PROVIDERS"; groqKeys?: string[]; jevKey?: string }
  | { type: "SET_DASHBOARD_URL"; url: string }
  | { type: "GRANT_PERMISSIONS"; kind: "pages" | "tabs" | "provider" }
  | { type: "INSTALL_SPEECH_PACK" }
  | { type: "TRANSCRIPT"; text: string; final: boolean }
  | { type: "TRANSCRIBE_AUDIO"; audio: number[]; mime: string; language: string }
  | { type: "GET_CALIBRATION"; mode: PointerMode }
  | { type: "SAVE_CALIBRATION"; mode: PointerMode; calibration: Calibration }
  | { type: "OFFSCREEN_COMMAND"; command: "start" | "pause" | "resume" | "stop" | "calibrate" | "settings" | "install-speech"; settings?: Settings }
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
  | { type: "FIND_RESULT"; ids: string[] }
  | { type: "METRIC"; event: MetricEvent }
  | { type: "GET_LOGS" }
  | { type: "CLEAR_LOGS" }
  | {
      type: "CONTROLLER_COMMAND";
      command: "pause" | "resume" | "stop" | "start" | "calibrate";
    }
  | { type: "RECALIBRATE" };
export async function send<T = any>(message: Message): Promise<T> {
  const result = await chrome.runtime.sendMessage(message);
  if (result?.ok === false) throw new Error(result.error || "The action failed. Retry from the popup.");
  return result;
}
