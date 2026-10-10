import type {
  Calibration,
  PointerSample,
  SessionState,
  Settings,
  PointerMode,
} from "../shared";
import { PointerFilter, type RawPoint } from "./math";
import type { Inference } from "./inference";
import { calibrationStages, calibrationStageMs, calibrationDurationMs, calibrationFromPoses, type CalibrationStage } from "./calibration";

interface CalibrationRun {
  start: number;
  poses: Record<CalibrationStage, RawPoint[]>;
  snapshots: Record<string, string>;
  timer: ReturnType<typeof setInterval>;
  resolve: (value: Calibration) => void;
  reject: (error: Error) => void;
}
export interface CalibrationStore {
  getCalibration(mode: PointerMode): Promise<Calibration | undefined>;
  saveCalibration(mode: PointerMode, calibration: Calibration): Promise<void>;
}
const localCalibrationStore: CalibrationStore = {
  async getCalibration(mode) {
    const stored = await chrome.storage.local.get(`calibration-${mode}`);
    return stored[`calibration-${mode}`] as Calibration | undefined;
  },
  async saveCalibration(mode, calibration) {
    await chrome.storage.local.set({ [`calibration-${mode}`]: calibration });
  },
};
interface TrackProcessorConstructor {
  new (options: { track: MediaStreamTrack; maxBufferSize: number }): {
    readable: ReadableStream<VideoFrame>;
  };
}
function trackProcessor(): TrackProcessorConstructor | undefined {
  return (
    globalThis as unknown as {
      MediaStreamTrackProcessor?: TrackProcessorConstructor;
    }
  ).MediaStreamTrackProcessor;
}
const validCalibration = (value: unknown, mode: PointerMode): value is Calibration => {
  const c = value as Calibration | undefined;
  return (
    !!c &&
    [c.neutralX, c.neutralY, c.rangeX, c.rangeY].every(Number.isFinite) &&
    c.neutralX >= 0 && c.neutralX <= 1 &&
    c.neutralY >= 0 && c.neutralY <= 1 &&
    c.rangeX >= 0.008 && c.rangeX <= 1 &&
    c.rangeY >= 0.008 && c.rangeY <= 1 &&
    [c.left, c.right, c.up, c.down, c.positiveX, c.negativeX, c.positiveY, c.negativeY].every(n => n === undefined || Number.isFinite(n) && n >= 0.008 && n <= 1) &&
    (c.invertX === undefined || typeof c.invertX === "boolean") &&
    (c.invertY === undefined || typeof c.invertY === "boolean")
  );
};

export class Tracker {
  private settings!: Settings;
  private generation = 0;
  private active = false;
  private paused = false;
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private model: Inference | null = null;
  private frameTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private frameEpoch = 0;
  private filter = new PointerFilter();
  private calibrated = false;
  private calibrationRun: CalibrationRun | null = null;
  private busy = false;
  private busySince = 0;
  private lastVideoTime = -1;
  private lastReply = 0;
  private previous = { x: 0.5, y: 0.5 };
  private fpsStart = 0;
  private count = 0;
  private fps = 0;
  private initializingReject: ((error: Error) => void) | null = null;
  private fallbackRunning = false;
  private reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
  private lastProcessed = -Infinity;
  constructor(
    private video: HTMLVideoElement,
    private onSample: (sample: PointerSample) => void,
    private onStatus: (patch: Partial<SessionState>) => void,
    private persistence: CalibrationStore = localCalibrationStore,
  ) {}
  async start(settings: Settings): Promise<void> {
    this.stop();
    const token = ++this.generation;
    this.settings = { ...settings };
    this.active = true;
    this.paused = false;
    this.onStatus({
      camera: "Requesting camera permission",
      trackingBackend: "Loading local model",
      confidence: 0,
    });
    try {
      const calibration = await this.persistence.getCalibration(
        settings.pointerMode,
      );
      if (token !== this.generation) return;
      this.calibrated = validCalibration(calibration, settings.pointerMode);
      if (validCalibration(calibration, settings.pointerMode))
        this.filter.setCalibration(calibration);
      else this.filter.reset();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      if (token !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.video.srcObject = stream;
      this.video.muted = true;
      this.video.playsInline = true;
      const playback = this.video.play();
      if (trackProcessor()) void playback.catch(() => {});
      else await playback;
      if (token !== this.generation) return;
      stream.getVideoTracks().forEach((track) =>
        track.addEventListener("ended", () => {
          if (token === this.generation) {
            this.loss();
            this.onStatus({
              camera: "Camera disconnected. Stop and start again.",
            });
            this.pause();
          }
        }),
      );
      try {
        await this.openWorker(token);
      } catch (error) {
        if (token !== this.generation) return;
        this.worker?.terminate();
        this.worker = null;
        await this.openMain(token, error);
      }
      if (token !== this.generation) return;
      this.onStatus({
        camera: this.calibrated
          ? "Camera ready"
          : "Camera ready. Calibrate your pointer to begin.",
      });
      this.lastReply = performance.now();
      this.fpsStart = performance.now();
      this.count = 0;
      this.fps = 0;
      this.watchdog = setInterval(() => {
        if (!this.active || this.paused) return;
        if (performance.now() - this.lastReply > 350) this.loss();
        if (
          this.busy &&
          performance.now() - this.busySince > 1500 &&
          this.worker
        )
          void this.recoverWorker(
            token,
            new Error("Tracking worker timed out"),
          );
      }, 100);
      if (!this.openCameraFrames(token)) this.schedule(token);
    } catch (error) {
      if (token !== this.generation) return;
      this.stop();
      this.onStatus({
        camera:
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Camera denied. Allow camera in browser permissions to use face or hand tracking. Voice still works."
            : `Camera unavailable: ${error instanceof Error ? error.message : String(error)}. Voice still works.`,
      });
      throw error;
    }
  }
  private openWorker(token: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(chrome.runtime.getURL("tracking-worker.js"));
      this.worker = worker;
      let ready = false;
      const timer = setTimeout(
        () => fail(new Error("Local tracking model timed out")),
        20000,
      );
      const fail = (error: Error) => {
        clearTimeout(timer);
        if (!ready) {
          this.initializingReject = null;
          reject(error);
        } else void this.recoverWorker(token, error);
      };
      this.initializingReject = fail;
      worker.onerror = (event) => {
        event.preventDefault();
        fail(new Error(event.message || "Tracking worker failed"));
      };
      worker.onmessage = (event) => {
        if (token !== this.generation || worker !== this.worker) return;
        const data = event.data;
        if (data.type === "ready") {
          ready = true;
          clearTimeout(timer);
          this.initializingReject = null;
          this.onStatus({ trackingBackend: "Worker / CPU" });
          resolve();
        } else if (data.type === "error") {
          this.loss();
          fail(new Error(data.message));
        } else if (data.type === "sample") {
          this.busy = false;
          if (!this.paused && this.active && data.epoch === this.frameEpoch) {
            if (performance.now() - data.timestamp > 350) this.loss();
            else this.accept(data.point, data.timestamp, data.latencyMs);
          }
        }
      };
      worker.postMessage({
        type: "init",
        mode: this.settings.pointerMode,
        baseURL: chrome.runtime.getURL(""),
      });
    });
  }
  private async openMain(token: number, error: unknown) {
    this.loss();
    this.onStatus({
      trackingBackend: "Loading measured main-thread fallback",
      feedback: `Worker unavailable: ${error instanceof Error ? error.message : String(error)}. Trying local CPU fallback.`,
    });
    const { createInference } = await import("./inference");
    if (token !== this.generation) return;
    const model = await createInference(
      chrome.runtime.getURL(""),
      this.settings.pointerMode,
    );
    if (token !== this.generation) {
      model.close();
      return;
    }
    this.model = model;
    this.onStatus({ trackingBackend: "Main thread / CPU fallback" });
  }
  private async recoverWorker(token: number, error: Error) {
    if (this.fallbackRunning || token !== this.generation) return;
    this.fallbackRunning = true;
    this.worker?.terminate();
    this.worker = null;
    this.busy = false;
    this.loss();
    try {
      await this.openMain(token, error);
    } catch (fallbackError) {
      if (token === this.generation) {
        this.pause();
        this.onStatus({
          camera: `Tracking failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}. Rebuild assets, then restart. Voice still works.`,
        });
      }
    } finally {
      this.fallbackRunning = false;
    }
  }
  private schedule(token: number) {
    if (token !== this.generation || !this.active) return;
    this.frameTimer = setTimeout(
      () => {
        if (token !== this.generation || !this.active) return;
        this.schedule(token);
        if (
          this.paused ||
          this.busy ||
          this.video.readyState < 2 ||
          this.video.currentTime === this.lastVideoTime
        )
          return;
        this.lastVideoTime = this.video.currentTime;
        void this.processImage(this.video, token);
      },
      this.model ? 66 : 33,
    );
  }
  private openCameraFrames(token: number): boolean {
    const Processor = trackProcessor(),
      track = this.stream?.getVideoTracks()[0];
    if (!Processor || !track) return false;
    let reader: ReadableStreamDefaultReader<VideoFrame>;
    try {
      reader = new Processor({ track, maxBufferSize: 1 }).readable.getReader();
    } catch {
      this.onStatus({
        feedback:
          "Raw camera frames are unavailable. Using the video capture compatibility path.",
      });
      return false;
    }
    this.reader = reader;
    void (async () => {
      try {
        while (token === this.generation && reader === this.reader) {
          const result = await reader.read();
          if (result.done) {
            if (token === this.generation && this.active) {
              this.pause();
              this.onStatus({
                camera: "Camera stream ended. Stop and start again.",
              });
            }
            break;
          }
          const frame = result.value;
          if (token !== this.generation || reader !== this.reader) {
            frame.close();
            break;
          }
          // Drain while inference is busy or paused. A one-frame source buffer and
          // no inference queue keep the next accepted frame current.
          void this.processImage(frame, token, () => frame.close());
        }
      } catch (error) {
        if (
          token === this.generation &&
          reader === this.reader &&
          this.active
        ) {
          this.loss();
          this.onStatus({
            feedback: `Raw camera frames stopped: ${String(error)}. Using video capture compatibility.`,
          });
          this.reader = null;
          this.schedule(token);
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {}
        if (reader === this.reader) this.reader = null;
      }
    })();
    return true;
  }
  private async processImage(
    image: ImageBitmapSource,
    token: number,
    release?: () => void,
  ): Promise<void> {
    const timestamp = performance.now();
    if (
      token !== this.generation ||
      !this.active ||
      this.paused ||
      this.busy ||
      (!this.worker && !this.model) ||
      timestamp - this.lastProcessed < (this.model ? 66 : 0)
    ) {
      release?.();
      return;
    }
    this.busy = true;
    this.busySince = timestamp;
    this.lastProcessed = timestamp;
    const worker = this.worker,
      epoch = this.frameEpoch;
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(image);
      const calibration = this.calibrationRun;
      if (calibration && typeof document !== "undefined") {
        const elapsed = timestamp - calibration.start;
        const stage = calibrationStages[Math.floor(elapsed / calibrationStageMs)];
        if (stage && elapsed % calibrationStageMs >= 2000 && !calibration.snapshots[stage]) {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = 160; canvas.height = 120;
            const context = canvas.getContext("2d");
            if (context) {
              context.drawImage(bitmap, 0, 0, 160, 120);
              calibration.snapshots[stage] = canvas.toDataURL("image/jpeg", 0.7);
              this.onStatus({ calibrationSnapshots: { ...calibration.snapshots } });
            }
          } catch {
            // Snapshot rendering is UI feedback; it must not interrupt inference.
          }
        }
      }
      release?.();
      release = undefined;
      if (
        token !== this.generation ||
        this.paused ||
        epoch !== this.frameEpoch ||
        worker !== this.worker
      ) {
        bitmap.close();
        bitmap = null;
        if (token === this.generation) this.busy = false;
        return;
      }
      if (worker) {
        worker.postMessage({ type: "frame", bitmap, timestamp, epoch }, [
          bitmap,
        ]);
        bitmap = null;
      } else if (this.model) {
        const start = performance.now();
        const point = this.model.detect(bitmap, timestamp);
        this.accept(point, timestamp, performance.now() - start);
        this.busy = false;
      } else this.busy = false;
    } catch (error) {
      if (token === this.generation) {
        this.busy = false;
        this.loss();
        if (worker) void this.recoverWorker(token, new Error(String(error)));
        else {
          this.pause();
          this.onStatus({
            camera: `Tracking failed. Stop and restart: ${String(error)}`,
          });
        }
      }
    } finally {
      bitmap?.close();
      release?.();
    }
  }
  private accept(point: RawPoint | null, time: number, latencyMs: number) {
    this.lastReply = performance.now();
    this.count++;
    if (time - this.fpsStart > 1000) {
      this.fps = (this.count * 1000) / (time - this.fpsStart);
      this.count = 0;
      this.fpsStart = time;
    }
    const run = this.calibrationRun;
    if (run && point && point.confidence >= this.settings.confidenceThreshold) {
      const elapsed = time - run.start;
      const stage = calibrationStages[Math.floor(elapsed / calibrationStageMs)];
      // Give each new pose 1.2 seconds to settle before collecting its frames.
      if (stage && elapsed % calibrationStageMs >= 1200) run.poses[stage].push(point);
    }
    // Calibration and uncalibrated frames must not integrate hidden travel.
    const position = this.filter.update(run || !this.calibrated ? null : point, time, this.settings);
    this.previous = { x: position.x, y: position.y };
    const sample = {
      ...position,
      confidence: run || !this.calibrated ? 0 : position.confidence,
      timestamp: time,
      source: this.settings.pointerMode,
      handHold: !run && this.calibrated && position.handHold,
      fps: this.fps,
      latencyMs,
    };
    this.onSample(sample);
    this.onStatus({ confidence: sample.confidence, fps: this.fps, latencyMs });
  }
  private loss() {
    if (!this.settings) return;
    this.filter.reset();
    this.onSample({
      ...this.previous,
      confidence: 0,
      handHold: false,
      timestamp: performance.now(),
      source: this.settings.pointerMode,
      fps: 0,
      latencyMs: 0,
    });
    this.onStatus({ confidence: 0 });
  }
  async calibrate(
    onProgress?: (progress: number, instruction: string) => void,
  ): Promise<Calibration> {
    if (!this.active || this.paused || (!this.worker && !this.model))
      throw new Error(
        "Start the camera and resume tracking before calibration.",
      );
    this.cancelCalibration("Calibration restarted");
    this.loss();
    const token = this.generation;
    this.onStatus({ calibrationSnapshots: {} });
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const instruction = (elapsed: number) => {
        const index = Math.min(4, Math.floor(elapsed / calibrationStageMs));
        const stage = calibrationStages[index];
        const remaining = Math.max(1, Math.ceil((calibrationStageMs - elapsed % calibrationStageMs) / 1000));
        const pose = stage === "center" ? "Hold your comfortable center position" : this.settings.pointerMode === "face" ? `Turn your head slightly ${stage} and hold` : `Move your palm a little ${stage} and hold`;
        return `${index + 1}/5 · ${stage} · ${pose}. Capturing in ${remaining}s.`;
      };
      const run: CalibrationRun = {
        start, poses: { center: [], left: [], right: [], up: [], down: [] }, snapshots: {}, resolve, reject,
        timer: setInterval(() => {
          const elapsed = performance.now() - start;
          onProgress?.(Math.min(1, elapsed / calibrationDurationMs), instruction(elapsed));
          if (elapsed < calibrationDurationMs) return;
          clearInterval(run.timer);
          if (this.calibrationRun !== run) return;
          this.calibrationRun = null;
          if (token !== this.generation || this.paused) { reject(new Error("Calibration cancelled")); return; }
          let calibration: Calibration;
          try { calibration = calibrationFromPoses(run.poses, this.settings.pointerMode); }
          catch (error) { reject(error instanceof Error ? error : new Error("Calibration failed")); return; }
          const mode = this.settings.pointerMode;
          this.persistence.saveCalibration(mode, calibration).then(() => {
            if (token !== this.generation || this.paused) { reject(new Error("Calibration cancelled")); return; }
            this.filter.setCalibration(calibration);
            this.calibrated = true;
            this.onStatus({ camera: "Calibrated. Camera ready" });
            resolve(calibration);
          }).catch(error => reject(new Error(`Could not save calibration: ${String(error)}`)));
        }, 100),
      };
      this.calibrationRun = run;
      onProgress?.(0, instruction(0));
    });
  }

  private cancelCalibration(message: string) {
    const run = this.calibrationRun;
    if (run) {
      clearInterval(run.timer);
      this.calibrationRun = null;
      run.reject(new Error(message));
    }
  }
  pause() {
    this.paused = true;
    this.frameEpoch++;
    this.cancelCalibration("Calibration paused");
    this.loss();
  }
  resume() {
    if (!this.active) return;
    this.paused = false;
    this.frameEpoch++;
    this.lastReply = performance.now();
    this.filter.reset();
  }
  updateSettings(settings: Settings) {
    const modeChanged =
      this.settings && this.settings.pointerMode !== settings.pointerMode;
    this.settings = { ...settings };
    if (modeChanged && this.active) {
      const wasPaused = this.paused;
      const restarting = this.start(settings);
      // start resets lifecycle flags before its first await. Restore pause now,
      // rather than after loading, and allow a later explicit resume to persist.
      if (wasPaused) this.pause();
      void restarting.catch(() => {});
    }
  }
  stop() {
    this.active = false;
    this.paused = false;
    ++this.generation;
    this.cancelCalibration("Calibration stopped");
    this.initializingReject?.(new Error("Tracking stopped"));
    this.initializingReject = null;
    if (this.frameTimer) clearTimeout(this.frameTimer);
    this.frameTimer = null;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    this.worker?.terminate();
    this.worker = null;
    this.model?.close();
    this.model = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    const reader = this.reader;
    this.reader = null;
    if (reader) void reader.cancel().catch(() => {});
    this.stream = null;
    this.video.srcObject = null;
    this.busy = false;
    this.lastVideoTime = -1;
    this.lastProcessed = -Infinity;
    this.calibrated = false;
    this.filter.reset();
    this.loss();
    this.onStatus({
      camera: "Off",
      trackingBackend: "Not started",
      fps: 0,
      latencyMs: 0,
    });
  }
}
