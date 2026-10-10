import { Tracker } from "./tracking";
import { SpeechAdapter } from "./speech";
import { RecordedSpeech } from "./recording";
import { send, type Message, type Settings, type Calibration, type PointerMode } from "./shared";

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
function status(patch: Record<string, unknown>) {
  const telemetry = Object.keys(patch).every(key => ["confidence", "fps", "latencyMs"].includes(key));
  if (telemetry && performance.now() - lastStatus < 500) return;
  if (telemetry) lastStatus = performance.now();
  void send({ type: "SET_STATE", patch }).catch(() => {});
}
function heard(text: string) {
  if (desired !== "running") return;
  void send({ type: "TRANSCRIPT", text, final: true }).catch(() => {});
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
  const voiceToken = voiceGeneration;
  const voiceSettings = { ...settings };
  const current = () => token === generation && voiceToken === voiceGeneration && desired === "running";
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
      const recorder = new RecordedSpeech(text => { if (current()) heard(text); }, voice => { if (current()) status({ voice }); });
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
    status({ voice });
    if (/connect|unavailable|not supported|repeated interruptions/i.test(voice)) void beginFallback();
  }, text => { if (current() && speech === adapter) void send({ type: "TRANSCRIPT", text, final: false }).catch(() => {}); });
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
  tracker = new Tracker(video, sample => {
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
  try { await tracker.start(next); }
  catch (error) { if (token === generation) status({ feedback: error instanceof Error ? error.message : "Camera unavailable. Voice can still be used." }); }
  finally { if (token === generation) starting = false; }
}
function pause() {
  desired = "paused";
  tracker?.pause(); stopVoice();
  status({ calibrationProgress: null, interimTranscript: "" });
}
function resume() {
  desired = "running";
  tracker?.resume();
  void beginVoice(generation);
}
function stop() {
  desired = "stopped"; ++generation;
  tracker?.stop(); tracker = null;
  stopVoice();
}
async function calibrate() {
  if (!tracker || desired !== "running" || starting) { status({ feedback: "Start the camera and wait until it is ready before calibrating." }); return; }
  const token = generation, activeTracker = tracker;
  const current = () => token === generation && desired === "running" && tracker === activeTracker;
  try {
    await activeTracker.calibrate(progress => { if (current()) status({ calibrationProgress: progress, calibrationStage: progress < 0.3125 ? "Keep your head centered and still" : settings.pointerMode === "hand" ? "Move your palm left, right, up, and down" : "Look left, right, up, and down" }); });
    if (!current()) return;
    status({ feedback: "Calibration saved. Return to your webpage and browse.", calibrationProgress: null, calibrationStage: "Ready" });
  } catch (error) { if (current()) status({ feedback: error instanceof Error ? error.message : "Calibration failed. Keep yourself in view and retry.", calibrationProgress: null }); }
}
chrome.runtime.onMessage.addListener((message: Message, _sender, respond) => {
  if (message.type !== "OFFSCREEN_COMMAND") return;
  if (message.command === "start" && message.settings) void start(message.settings);
  if (message.command === "stop") stop();
  if (message.command === "pause") pause();
  if (message.command === "resume") resume();
  if (message.command === "calibrate") void calibrate();
  if (message.command === "settings" && message.settings) {
    const previous = settings;
    settings = message.settings;
    tracker?.updateSettings(settings);
    if (desired === "running" && (settings.language !== previous?.language || settings.speechMode !== previous?.speechMode)) void beginVoice(generation);
  }
  respond({ ok: true });
});
