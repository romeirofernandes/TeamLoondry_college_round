import type { GestureCalibration, GesturePreset, GestureRuntimeStatus, HandGesture } from "./shared";

type PoseMessage = { type: "pose"; gesture: HandGesture | null; confidence: number; timestamp: number };

export class GestureRuntime {
  private worker: Worker;
  private timer: ReturnType<typeof setInterval>;
  private busy = false;
  private paused = false;
  private armed = true;
  private heldGesture: HandGesture | null = null;
  private heldFrames = 0;
  private heldSince=0;
  private lastPose=-Infinity;
  private lastFired=-Infinity;
  private neutralFrames = 0;
  private calibrationGesture: HandGesture | null = null;
  private calibrationFrames = 0;
  private calibrationConfidence = 0;
  private completedCalibration: GestureCalibration | null = null;
  private calibrationTimer: ReturnType<typeof setTimeout> | null = null;
  private presets: GesturePreset[];
  private lastStatus = 0;
  private ready = false;
  constructor(
    private video: HTMLVideoElement,
    presets: GesturePreset[],
    private onTrigger: (presetId: string) => void,
    private onStatus: (status: GestureRuntimeStatus) => void,
    private onCalibrationPreview: (active: boolean) => void = () => {},
  ) {
    this.presets = presets;
    if(presets.some(p=>p.holdMs!==undefined))this.armed=false;
    this.worker = new Worker(chrome.runtime.getURL("gesture-worker.js"));
    this.worker.onmessage = event => this.receive(event.data);
    this.worker.onerror = event => this.publish({ ready: false, detected: null, confidence: 0, error: event.message || "Gesture recognition stopped." });
    this.worker.postMessage({ type: "init", baseURL: chrome.runtime.getURL("") });
    this.timer = setInterval(() => void this.frame(), 150);
  }
  update(presets: GesturePreset[]) {
    const scoped=(items:GesturePreset[])=>JSON.stringify(items.filter(p=>p.holdMs!==undefined));
    if(scoped(this.presets)!==scoped(presets)) {this.armed=false;this.heldGesture=null;this.heldFrames=0;this.neutralFrames=0;this.lastPose=-Infinity;}
    this.presets=presets;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.armed = !this.presets.some(p=>p.holdMs!==undefined);
    this.lastPose=-Infinity;
    this.heldGesture = null;
    this.heldFrames = 0;
    this.neutralFrames = 0;
    if (paused && this.calibrationGesture) this.cancelCalibration();
  }
  calibrate(gesture: HandGesture) {
    if (this.calibrationTimer) clearTimeout(this.calibrationTimer);
    this.calibrationGesture = gesture;
    this.calibrationFrames = 0;
    this.calibrationConfidence = 0;
    this.completedCalibration = null;
    this.armed = false;
    this.onCalibrationPreview(true);
    this.publish({ ready: this.ready, detected: null, confidence: 0, calibrating: gesture, calibrationProgress: 0 });
    this.calibrationTimer = setTimeout(() => {
      this.calibrationGesture = null;
      this.calibrationTimer = null;
      this.calibrationFrames = 0;
      this.calibrationConfidence = 0;
      this.onCalibrationPreview(false);
      this.publish({ ready: this.ready, detected: null, confidence: 0, error: "Could not capture that pose. Keep your hand in frame and try again." }, true);
    }, 15000);
  }
  cancelCalibration() {
    if (this.calibrationTimer) clearTimeout(this.calibrationTimer);
    this.calibrationTimer = null;
    this.calibrationGesture = null;
    this.calibrationFrames = 0;
    this.calibrationConfidence = 0;
    this.completedCalibration = null;
    this.onCalibrationPreview(false);
    this.publish({ ready: this.ready, detected: null, confidence: 0, calibrating: null, calibrationProgress: 0 });
  }
  stop() {
    if (this.calibrationTimer) clearTimeout(this.calibrationTimer);
    this.calibrationTimer = null;
    this.onCalibrationPreview(false);
    clearInterval(this.timer);
    this.worker.postMessage({ type: "close" });
    this.worker.terminate();
  }
  private publish(status: GestureRuntimeStatus, force = false) {
    const now = performance.now();
    if (!force && now - this.lastStatus < 140) return;
    this.lastStatus = now;
    this.onStatus(status);
  }
  private async frame() {
    if (!this.ready || this.busy || this.paused || (!this.calibrationGesture && !this.presets.some(preset => preset.enabled)) || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    this.busy = true;
    try {
      const bitmap = await createImageBitmap(this.video);
      this.worker.postMessage({ type: "frame", bitmap, timestamp: performance.now() }, [bitmap]);
    } catch {
      this.busy = false;
    }
  }
  private receive(message: any) {
    if (message.type === "ready") {
      this.ready = true;
      this.publish({ ready: true, detected: null, confidence: 0 }, true);
      return;
    }
    if (message.type === "error") {
      this.busy = false;
      this.publish({ ready: false, detected: null, confidence: 0, error: String(message.message || "Gesture recognition failed.") }, true);
      return;
    }
    if (message.type !== "pose") return;
    this.busy = false;
    const pose = message as PoseMessage;
    if (this.paused) return;
    if(this.presets.some(p=>p.holdMs!==undefined)){
      if(!Number.isFinite(pose.timestamp)||pose.timestamp<=this.lastPose)return;
      if(pose.timestamp-this.lastPose>500){this.heldGesture=null;this.heldFrames=0;this.neutralFrames=0;}
      this.lastPose=pose.timestamp;
    }
    if (this.calibrationGesture) {
      if (pose.gesture === this.calibrationGesture && pose.confidence >= 0.35) {
        this.calibrationFrames++;
        this.calibrationConfidence += pose.confidence;
      } else {
        this.calibrationFrames = 0;
        this.calibrationConfidence = 0;
      }
      const progress = Math.min(1, this.calibrationFrames / 7);
      if (this.calibrationFrames >= 7) {
        if (this.calibrationTimer) clearTimeout(this.calibrationTimer);
        this.calibrationTimer = null;
        const calibration: GestureCalibration = {
          threshold: Math.max(0.35, Math.min(0.99, this.calibrationConfidence / this.calibrationFrames * 0.72)),
          calibratedAt: Date.now(),
        };
        this.calibrationGesture = null;
        this.calibrationFrames = 0;
        this.completedCalibration = calibration;
        this.armed = false;
        this.onCalibrationPreview(false);
        this.publish({ ready: true, detected: pose.gesture, confidence: pose.confidence, calibrating: null, calibrationProgress: 1, calibration }, true);
        return;
      }
      this.publish({ ready: true, detected: pose.gesture, confidence: pose.confidence, calibrating: this.calibrationGesture, calibrationProgress: progress });
      return;
    }
    this.publish({ ready: true, detected: pose.gesture, confidence: pose.confidence, ...(this.completedCalibration ? { calibration: this.completedCalibration, calibrationProgress: 1 } : {}) });
    if (!pose.gesture) {
      this.neutralFrames++;
      if (this.neutralFrames >= 4) {
        this.armed = true;
        this.heldGesture = null;
        this.heldFrames = 0;
      }
      return;
    }
    this.neutralFrames = 0;
    const preset = this.presets.find(item => item.enabled && item.gesture === pose.gesture && pose.confidence >= item.calibration.threshold);
    if (!preset) { this.heldGesture = null; this.heldFrames = 0; return; }
    if (this.heldGesture === pose.gesture) this.heldFrames++;
    else { this.heldGesture = pose.gesture; this.heldFrames = 1;this.heldSince=pose.timestamp; }
    if (this.armed && (preset.holdMs===undefined?this.heldFrames>=5:pose.timestamp-this.heldSince>=preset.holdMs&&pose.timestamp-this.lastFired>=(preset.cooldownMs??1200))) {
      this.lastFired=pose.timestamp;
      this.armed = false;
      this.onTrigger(preset.id);
      this.publish({ ready: true, detected: pose.gesture, confidence: pose.confidence }, true);
    }
  }
}
