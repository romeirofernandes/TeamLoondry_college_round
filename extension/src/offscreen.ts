import {defaultMeetPreferences,type MeetPreferences,type HeadGesture} from "./meet/model";
import {MeetGestureGate,HeadCalibration,matchHead,type HeadPose} from "./meet/gestures";
import {inputMethods,type MeetRuntimeContext} from "./shared";
import { Tracker } from "./tracking";
import { GestureRuntime } from "./gesture-runtime";
import { normalizeGesturePresets } from "./gestures";
import { SpeechAdapter } from "./speech";
import { RecordedSpeech } from "./recording";
import { send, voiceEnabled, type Message, type Settings, type Calibration, type PointerMode, type GesturePreset, type GestureRuntimeStatus } from "./shared";

let settings: Settings;
let privateInput = false;
let meetContext:MeetRuntimeContext|null=null;
let meetPreferences:MeetPreferences=structuredClone(defaultMeetPreferences);
let browsingPresets:GesturePreset[]=[];
let headCalibration:HeadCalibration|null=null;
let headCalibrationTimer:ReturnType<typeof setTimeout>|null=null;
const meetHeadGate=new MeetGestureGate();
let meetSuppressUntil=0,lastMeetPose=0;
function poseStatus(value:import("./shared").MeetPoseStatus){void send({type:"MEET_POSE_STATUS",status:value}).catch(()=>{});}
function headSample(pose:HeadPose|null,time:number){
 if(privateInput||desired!=="running"){meetHeadGate.reset();return;}
 if(headCalibration){headCalibration.sample(pose,time);if(time-lastMeetPose>150){lastMeetPose=time;poseStatus({pose,stage:time-headCalibration.started<2000?"Hold your comfortable neutral pose.":`Now ${headCalibration.gesture.replaceAll('-',' ')} comfortably and hold.`});}return;}
 if(!meetContext||!meetPreferences.face||!settings||!inputMethods(settings).includes("face"))return;
 const mapping=pose?matchHead(pose,meetPreferences.head):null;
 if(mapping)meetSuppressUntil=performance.now()+500;
 if(meetHeadGate.update(mapping?.gesture??null,!!pose&&pose.quality>=0.7,time,meetPreferences.holdMs,meetPreferences.cooldownMs)&&mapping){void send({type:"MEET_GESTURE_TRIGGER",context:meetContext,gesture:mapping.gesture,inputKind:"face"}).catch(()=>{});}
}
function setHeadTracking(){tracker?.setPoseListener((headCalibration||meetContext&&meetPreferences.face&&meetPreferences.head.some(m=>m.enabled))&&settings?.pointerMode==="face"?headSample:null);}
function cancelHeadCalibration(){if(headCalibrationTimer)clearTimeout(headCalibrationTimer);headCalibrationTimer=null;headCalibration=null;gestureRuntime?.setPaused(privateInput||desired!=="running");gesturePreview(false);meetHeadGate.reset();setHeadTracking();}
function configureMeet(context:MeetRuntimeContext|null,preferences:MeetPreferences){
 const changed=JSON.stringify(meetContext)!==JSON.stringify(context);meetContext=context;meetPreferences=preferences;if(changed){meetHeadGate.reset();meetSuppressUntil=0;}
 setHeadTracking();setGesturePresets(browsingPresets);
}

let privateSession="legacy",privateRevision=0;
const voiceStarts = new Set<Promise<void>>();
function trackVoice(work:Promise<void>) {voiceStarts.add(work);void work.finally(()=>voiceStarts.delete(work)).catch(()=>{});return work;}
function beginVoice(token:number) {return trackVoice(startVoice(token));}
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
    if (desired !== "running" || (!gestureRuntime&&!headCalibration) || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
    const scale = Math.min(1, 480 / video.videoWidth);
    gesturePreviewCanvas!.width = Math.round(video.videoWidth * scale);
    gesturePreviewCanvas!.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, gesturePreviewCanvas!.width, gesturePreviewCanvas!.height);
    void send({ type: "GESTURE_PREVIEW_FRAME", frame: gesturePreviewCanvas!.toDataURL("image/jpeg", 0.62) }).catch(() => {});
  }, 250);
}
function createGestureRuntime(presets: GesturePreset[]) {
  const runtime = new GestureRuntime(video, presets, presetId => {
    if(privateInput||headCalibration)return;
    const mapping=meetContext&&meetPreferences.hand?meetPreferences.hands.find(m=>m.enabled&&presetId===`hf_meet_${m.gesture}`):null;
    if(mapping){void send({type:"MEET_GESTURE_TRIGGER",context:meetContext!,gesture:mapping.gesture,inputKind:"hand"}).catch(()=>{});return;}
    void send({ type: "GESTURE_TRIGGER", presetId }).catch(() => {});
  }, gestureStatus, gesturePreview);
  runtime.setPaused(privateInput || desired!=="running");return runtime;
}
function gestureStatus(status: GestureRuntimeStatus) { if(meetContext&&status.detected&&meetPreferences.hands.some(m=>m.enabled&&m.gesture===status.detected))meetSuppressUntil=performance.now()+500;void send({ type: "GESTURE_STATUS", status }).catch(() => {}); }
function setGesturePresets(presets: GesturePreset[]) {
  browsingPresets=normalizeGesturePresets(presets);
  if (settings?.voiceOnly || desired !== "running" || !tracker) {
    gestureRuntime?.stop(); gestureRuntime = null;
    gestureStatus({ ready: false, detected: null, confidence: 0 });
    return;
  }
  const scoped:GesturePreset[]=meetContext&&meetPreferences.hand&&inputMethods(settings).includes("hand")?meetPreferences.hands.filter(m=>m.enabled).map(m=>({id:`hf_meet_${m.gesture}`,name:"Meet gesture",gesture:m.gesture as import("./shared").HandGesture,action:{type:"media-play"},enabled:true,calibration:{threshold:m.threshold,calibratedAt:m.calibratedAt},holdMs:meetPreferences.holdMs,cooldownMs:meetPreferences.cooldownMs})):[];
  const enabled=[...scoped,...browsingPresets.filter(p=>!scoped.some(m=>m.gesture===p.gesture))];
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
  if (privateInput || feedbackSpeaking) return;
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
async function startVoice(token: number) {
  stopVoice();
  if (privateInput) { status({voice:"Off — private entry"}); return; }
  if (!settings || (!uiListening && !voiceEnabled(settings))) { status({ voice: "Off, voice input not selected" }); return; }
  const voiceToken = voiceGeneration;
  const voiceSettings = { ...settings };
  const current = () => !privateInput && token === generation && voiceToken === voiceGeneration && (desired !== "stopped" || uiListening) && !feedbackSpeaking;
  if (!current()) return;
  let fallbackStarting = false;
  const beginFallback = () => trackVoice(startFallback());
  const startFallback = async () => {
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
    void send({ type: "POINTER", sample:{...sample,meetGestureHeld:performance.now()<meetSuppressUntil||!!headCalibration} }).catch(() => {});
    const now = performance.now();
    if (now - lastTelemetry > 500) {
      lastTelemetry = now;
      status({ confidence: sample.confidence, fps: sample.fps, latencyMs: sample.latencyMs });
    }
  }, patch => { if (token === generation) status(patch); }, {
    getCalibration: (mode: PointerMode) => send<Calibration | undefined>({ type: "GET_CALIBRATION", mode }),
    saveCalibration: async (mode: PointerMode, calibration: Calibration) => { await send({ type: "SAVE_CALIBRATION", mode, calibration }); },
  });
  setHeadTracking();
  // Voice starts independently: loading a vision model must not delay listening.
  void beginVoice(token);
  try { if (tracker) await tracker.start(next); else status({camera:"Off, voice-only session", trackingBackend:"Voice only", confidence:0, fps:0}); }
  catch (error) { if (token === generation) status({ feedback: error instanceof Error ? error.message : "Camera unavailable. Voice can still be used." }); }
  finally {
    if (token === generation) {
      starting = false;
      if (desired === "running" && tracker && !next.voiceOnly) {
        // Storage is owned by the service worker. Offscreen documents do not
        // rely on the storage API being exposed in every supported context.
        try {
          const presets = await send<GesturePreset[]>({ type: "GET_GESTURE_PRESETS" });
          setGesturePresets(normalizeGesturePresets(presets));
          const meet=await send<{runtimeContext:MeetRuntimeContext|null;preferences:MeetPreferences}>({type:"GET_MEET_STATUS"});if(token===generation)configureMeet(meet.runtimeContext,meet.preferences);
        } catch (error) {
          setGesturePresets([]);
          status({ feedback: `Gesture presets could not be loaded: ${error instanceof Error ? error.message : String(error)}` });
        }
      }
    }
  }
}
function pause() {
  cancelHeadCalibration();meetHeadGate.reset();meetSuppressUntil=0;
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
  gestureRuntime?.setPaused(privateInput);
  void beginVoice(generation);
}
function stop() {
  cancelHeadCalibration();meetHeadGate.reset();meetSuppressUntil=0;meetContext=null;
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
 if (privateInput || !settings?.spokenFeedback || desired === "stopped" || !text.trim() || typeof speechSynthesis === "undefined") return;
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
  if (_sender.tab && !_sender.url?.startsWith(chrome.runtime.getURL(""))) return;
  if (message.type === "SPEAK_FEEDBACK") { if(message.enabled) void speakFeedback(message.text); respond({ok:true});return; }
  if(message.type==="MEET_RUNTIME"){configureMeet(message.context,message.preferences);respond({ok:true});return;}
  if(message.type==="MEET_HEAD_CANCEL"){cancelHeadCalibration();respond({ok:true});return;}
  if(message.type==="MEET_HEAD_CALIBRATE"){
    if(privateInput||desired!=="running"||!tracker||settings.pointerMode!=="face"){respond({ok:false});return;}
    cancelHeadCalibration();gestureRuntime?.setPaused(true);headCalibration=new HeadCalibration(message.gesture,performance.now());setHeadTracking();gesturePreview(true);
    headCalibrationTimer=setTimeout(()=>{const result=headCalibration?.result();cancelHeadCalibration();gestureRuntime?.setPaused(privateInput||desired!=="running");poseStatus(result?{pose:null,calibration:result,stage:"Head gesture calibrated."}:{pose:null,error:"Could not calibrate a distinct comfortable pose. Keep your face visible and try again."});},5000);respond({ok:true});return;
  }
  if (message.type !== "OFFSCREEN_COMMAND") return;
  if (message.command === "private-enter") {
    const session=message.privateSession??"legacy",revision=message.privateRevision??0;
    if(session===privateSession&&revision<privateRevision){respond({ok:false});return;}
    privateSession=session;privateRevision=revision;
    cancelHeadCalibration();meetHeadGate.reset();meetSuppressUntil=0;
    privateInput = true; ++feedbackGeneration; feedbackSpeaking = false;
    uiListening = false; clearTimeout(uiLease); stopVoice();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    gestureRuntime?.setPaused(true);
    status({voice:"Off — private entry"});
    void Promise.allSettled([...voiceStarts]).then(()=>respond({ok:true,privateInput:true})); return true;
  }
  if (message.command === "private-exit") {
    if((message.privateSession??"legacy")!==privateSession || (message.privateRevision??0)!==privateRevision){respond({ok:false});return;}
    privateInput = false; if (desired === "running") gestureRuntime?.setPaused(false);
    if (voiceActive()) void beginVoice(generation);
    respond({ok:true}); return;
  }
  if (message.command === "ui-start" && privateInput) { respond({ok:false}); return; }
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
