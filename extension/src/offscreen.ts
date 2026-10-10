import { Tracker } from "./tracking";
import { GestureRuntime } from "./gesture-runtime";
import { normalizeGesturePresets } from "./gestures";
import { SpeechAdapter } from "./speech";
import { RecordedSpeech } from "./recording";
import { send, voiceEnabled, type Message, type Settings, type Calibration, type PointerMode, type GesturePreset, type GestureRuntimeStatus } from "./shared";

let settings: Settings;
let tracker: Tracker | null = null;
let speech: SpeechAdapter | null = null;
let fallback: RecordedSpeech | null = null;
let desired: "running" | "paused" | "stopped" = "stopped";
let generation = 0;
let voiceGeneration = 0;
let starting = false;
let lastTelemetry = 0;
const video = document.querySelector("#camera") as HTMLVideoElement;
let lastStatus = 0;
let feedbackGeneration = 0;
let feedbackSpeaking = false;
let uiListening = false;
let uiLease: ReturnType<typeof setTimeout> | undefined;
let gestureRuntime: GestureRuntime | null = null;
let gesturePreviewTimer: ReturnType<typeof setInterval> | null = null;
let gesturePreviewCanvas: HTMLCanvasElement | null = null;
function gesturePreview(active: boolean) {
  if (gesturePreviewTimer) clearInterval(gesturePreviewTimer);
  gesturePreviewTimer = null;
  if (!active) {
    void send({ type: "GESTURE_PREVIEW_FRAME", frame: null }).catch(() => {});
    return;
  }
  void send({ type: "GESTURE_PREVIEW_FRAME", frame: null }).catch(() => {});
  gesturePreviewCanvas = document.createElement("canvas");
  const context = gesturePreviewCanvas.getContext("2d", { alpha: false });
  if (!context) return;
  gesturePreviewTimer = setInterval(() => {
    if (desired !== "running" || !gestureRuntime || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
    const scale = Math.min(1, 480 / video.videoWidth);
    gesturePreviewCanvas!.width = Math.round(video.videoWidth * scale);
    gesturePreviewCanvas!.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, gesturePreviewCanvas!.width, gesturePreviewCanvas!.height);
    void send({ type: "GESTURE_PREVIEW_FRAME", frame: gesturePreviewCanvas!.toDataURL("image/jpeg", 0.62) }).catch(() => {});
  }, 250);
}
function createGestureRuntime(presets: GesturePreset[]) {
  return new GestureRuntime(video, presets, presetId => {
    void send({ type: "GESTURE_TRIGGER", presetId }).catch(() => {});
  }, gestureStatus, gesturePreview);
}
function gestureStatus(status: GestureRuntimeStatus) { void send({ type: "GESTURE_STATUS", status }).catch(() => {}); }
function setGesturePresets(presets: GesturePreset[]) {
  if (settings?.voiceOnly || desired !== "running" || !tracker) {
    gestureRuntime?.stop(); gestureRuntime = null;
    gestureStatus({ ready: false, detected: null, confidence: 0 });
    return;
  }
  const enabled = normalizeGesturePresets(presets);
  if (!enabled.some(preset => preset.enabled) && !gestureRuntime) {
    gestureStatus({ ready: false, detected: null, confidence: 0 });
    return;
  }
  if (!enabled.some(preset => preset.enabled) && gestureRuntime) {
    gestureRuntime.stop(); gestureRuntime = null;
    gestureStatus({ ready: false, detected: null, confidence: 0 });
    return;
  }
  if (gestureRuntime) gestureRuntime.update(enabled);
  else if (enabled.some(preset => preset.enabled)) {
    gestureRuntime = createGestureRuntime(enabled);
  }
}
function status(patch: Record<string, unknown>) {
  const telemetry = Object.keys(patch).every(key => ["confidence", "fps", "latencyMs"].includes(key));
  if (telemetry && performance.now() - lastStatus < 500) return;
  if (telemetry) lastStatus = performance.now();
  void send({ type: "SET_STATE", patch }).catch(() => {});
}
function heard(text: string) {
  if (feedbackSpeaking) return;
  if (uiListening) { void send({ type: "UI_HEARD", text }).catch(() => {}); return; }
  if (desired === "stopped") return;
  if (desired === "running") void send({ type: "TRANSCRIPT", text, final: true }).catch(() => {});
  void send({ type: "HEARD", text }).catch(() => {});
}
function stopVoice() {
  ++voiceGeneration;
  const oldSpeech = speech, oldFallback = fallback;
  speech = null; fallback = null;
  oldSpeech?.stop(); oldFallback?.stop();
}
async function beginVoice(token: number) {
  stopVoice();
  if (!settings || (!uiListening && !voiceEnabled(settings))) { status({ voice: "Off, voice input not selected" }); return; }
  const voiceToken = voiceGeneration;
  const voiceSettings = { ...settings };
  const current = () => token === generation && voiceToken === voiceGeneration && (desired !== "stopped" || uiListening) && !feedbackSpeaking;
  if (!current()) return;
  let fallbackStarting = false;
  const beginFallback = async () => {
    if (!current() || voiceSettings.speechMode !== "browser" || fallbackStarting || fallback) return;
    fallbackStarting = true;
    try {
      const provider = await send<{ groqKeyCount: number }>({ type: "GET_PROVIDER_STATUS" });
      if (!current() || !provider.groqKeyCount) return;
      const oldSpeech = speech;
      speech = null;
      oldSpeech?.stop();
      if (!current()) return;
      const recorder = new RecordedSpeech(text => { if (current()) heard(text); }, voice => { if (current()) status({ voice: desired === "paused" && /listening/i.test(voice) ? "Listening for resume" : voice }); });
      fallback = recorder;
      try { await recorder.start(voiceSettings.language); }
      catch (error) {
        recorder.stop();
        if (current()) {
          fallback = null;
          status({ voice: "Microphone unavailable", feedback: error instanceof Error ? error.message : "Allow microphone access from the popup, then restart." });
        }
      }
    } catch (error) {
      if (current()) status({ feedback: error instanceof Error ? error.message : "Could not start cloud speech. Retry from the popup." });
    } finally { fallbackStarting = false; }
  };
  const adapter = new SpeechAdapter(text => { if (current() && speech === adapter) heard(text); }, voice => {
    if (!current() || speech !== adapter) return;
    status({ voice: desired === "paused" && /listening/i.test(voice) ? "Listening for resume" : voice });
    if (/connect|unavailable|not supported|repeated interruptions/i.test(voice)) void beginFallback();
  }, text => { if (current() && desired === "running" && speech === adapter) void send({ type: "TRANSCRIPT", text, final: false }).catch(() => {}); });
  speech = adapter;
  try { await adapter.start(voiceSettings); }
  catch { if (current()) await beginFallback(); }
}
async function start(next: Settings) {
  stop();
  settings = next;
  desired = "running";
  const token = ++generation;
  starting = true;
  if (!next.voiceOnly) tracker = new Tracker(video, sample => {
    if (token !== generation || desired !== "running") return;
    void send({ type: "POINTER", sample }).catch(() => {});
    const now = performance.now();
    if (now - lastTelemetry > 500) {
      lastTelemetry = now;
      status({ confidence: sample.confidence, fps: sample.fps, latencyMs: sample.latencyMs });
    }
  }, patch => { if (token === generation) status(patch); }, {
    getCalibration: (mode: PointerMode) => send<Calibration | undefined>({ type: "GET_CALIBRATION", mode }),
    saveCalibration: async (mode: PointerMode, calibration: Calibration) => { await send({ type: "SAVE_CALIBRATION", mode, calibration }); },
  });
  // Voice starts independently: loading a vision model must not delay listening.
  void beginVoice(token);
  try { if (tracker) await tracker.start(next); else status({camera:"Off, voice-only session", trackingBackend:"Voice only", confidence:0, fps:0}); }
  catch (error) { if (token === generation) status({ feedback: error instanceof Error ? error.message : "Camera unavailable. Voice can still be used." }); }
  finally {
    if (token === generation) {
      starting = false;
      if (desired === "running" && tracker && !next.voiceOnly) {
        const stored = await chrome.storage.local.get("gesturePresets");
        setGesturePresets(normalizeGesturePresets(stored.gesturePresets));
      }
    }
  }
}
function pause() {
  ++feedbackGeneration; feedbackSpeaking=false; if(typeof speechSynthesis!=="undefined")speechSynthesis.cancel();
  desired = "paused";
  tracker?.pause(); gestureRuntime?.setPaused(true); stopVoice();
  status({ calibrationProgress: null, interimTranscript: "" });
  void beginVoice(generation);
}
function resume() {
  if (!settings.voiceOnly && !tracker) { void start(settings); return; }
  desired = "running";
  tracker?.resume();
  gestureRuntime?.setPaused(false);
  void beginVoice(generation);
}
function stop() {
  uiListening = false; clearTimeout(uiLease);
  desired = "stopped"; ++generation; ++feedbackGeneration;
  feedbackSpeaking = false; if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  tracker?.stop(); tracker = null;
  gestureRuntime?.stop(); gestureRuntime = null;
  gestureStatus({ ready: false, detected: null, confidence: 0 });
  stopVoice();
}
async function calibrate() {
  if (!tracker || desired !== "running" || starting) { status({ feedback: "Start the camera and wait until it is ready before calibrating." }); return; }
  const token = generation, activeTracker = tracker;
  const current = () => token === generation && desired === "running" && tracker === activeTracker;
  try {
    await activeTracker.calibrate((progress, instruction) => { if (current()) status({ calibrationProgress: progress, calibrationStage: instruction }); });
    if (!current()) return;
    status({ feedback: "Calibration saved. Return to your webpage and browse.", calibrationProgress: null, calibrationStage: "Ready" });
  } catch (error) { if (current()) status({ feedback: error instanceof Error ? error.message : "Calibration failed. Keep yourself in view and retry.", calibrationProgress: null }); }
}
function voiceActive() { return desired !== "stopped" || uiListening; }
async function speakFeedback(text: string) {
 if (!settings?.spokenFeedback || desired === "stopped" || !text.trim() || typeof speechSynthesis === "undefined") return;
 const token = ++feedbackGeneration;
 stopVoice(); feedbackSpeaking = true; speechSynthesis.cancel();
 const utterance = new SpeechSynthesisUtterance(text.slice(0,800));
 utterance.lang = settings.language; utterance.rate = 1.15;
 await new Promise<void>(resolve => {
  const timer = setTimeout(() => { if(token===feedbackGeneration) speechSynthesis.cancel();resolve(); },12000);
  utterance.onend = utterance.onerror = () => {clearTimeout(timer);resolve();};
  speechSynthesis.speak(utterance);
 });
 if(token!==feedbackGeneration || !voiceActive()) return;
 await new Promise(resolve => setTimeout(resolve,350));
 if(token!==feedbackGeneration || !voiceActive()) return;
 feedbackSpeaking = false;
 void beginVoice(generation);
}
chrome.runtime.onMessage.addListener((message: Message, _sender, respond) => {
  if (message.type === "SPEAK_FEEDBACK") { if(message.enabled) void speakFeedback(message.text); respond({ok:true});return; }
  if (message.type !== "OFFSCREEN_COMMAND") return;
  if (message.command === "ui-start" && message.settings) {
    const wasListening = uiListening;
    uiListening = true; settings = message.settings;
    clearTimeout(uiLease);
    // A closed dashboard must never leave a setup microphone running.
    uiLease = setTimeout(() => { uiListening = false; stopVoice(); if (desired !== "stopped") void beginVoice(generation); else status({voice:"Off"}); }, 15000);
    if (!wasListening && !feedbackSpeaking) void beginVoice(generation);
  }
  if (message.command === "ui-stop") {
    uiListening = false; clearTimeout(uiLease); stopVoice();
    if (desired !== "stopped" && !feedbackSpeaking) void beginVoice(generation);
    else status({voice:"Off"});
  }
  if (message.command === "narration-start") {
    ++feedbackGeneration; if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    stopVoice(); feedbackSpeaking = true;
  }
  if (message.command === "narration-end") { feedbackSpeaking = false; if (voiceActive()) void beginVoice(generation); }
  if (message.command === "start" && message.settings) void start(message.settings);
  if (message.command === "stop") stop();
  if (message.command === "pause") pause();
  if (message.command === "resume") resume();
  if (message.command === "calibrate") void calibrate();
  if (message.command === "gesture-calibrate" && message.gesture) {
    if (!tracker || desired !== "running" || starting || settings?.voiceOnly) {
      gestureStatus({ ready: false, detected: null, confidence: 0, error: "Start a camera session before calibrating gesture shortcuts." });
    } else {
      if (!gestureRuntime) gestureRuntime = createGestureRuntime([]);
      gestureRuntime.calibrate(message.gesture);
    }
  }
  if (message.command === "gesture-cancel-calibration") gestureRuntime?.cancelCalibration();
  if (message.command === "gesture-presets" && message.presets) setGesturePresets(message.presets);
  if (message.command === "settings" && message.settings) {
    const previous = settings;
    settings = message.settings;
    if (desired !== "stopped" && previous?.voiceOnly !== settings.voiceOnly) {
      if (desired === "paused") {
        const next = settings;
        stop(); settings = next; desired = "paused";
        status({camera: next.voiceOnly ? "Off, voice-only session" : "Camera waits for resume", confidence:0, fps:0});
        void beginVoice(generation);
      } else void start(settings);
      respond({ok:true}); return;
    }
    tracker?.updateSettings(settings);
    if (desired !== "stopped" && (voiceEnabled(settings) !== (previous ? voiceEnabled(previous) : false) || settings.language !== previous?.language || settings.speechMode !== previous?.speechMode)) void beginVoice(generation);
  }
  respond({ ok: true });
});

// PermissionStatus changes when Chrome grants or revokes device access.
if (typeof navigator !== "undefined" && navigator.permissions) {
  void Promise.all(["camera", "microphone"].map(name => navigator.permissions.query({ name: name as PermissionName }).catch(() => null))).then(([camera, microphone]) => {
    const report = () => void send({ type: "MEDIA_PERMISSIONS", camera: camera?.state ?? "unknown", microphone: microphone?.state ?? "unknown" }).catch(() => {});
    camera?.addEventListener("change", report);
    microphone?.addEventListener("change", report);
    report();
  });
}
