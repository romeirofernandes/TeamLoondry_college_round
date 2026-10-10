import type {
  Calibration,
  PointerSample,
  SessionState,
  Settings,
} from "../shared";
import { PointerFilter, type RawPoint } from "./math";
import type { Inference } from "./inference";

interface CalibrationRun {
  start: number;
  neutral: RawPoint[];
  range: RawPoint[];
  timer: ReturnType<typeof setInterval>;
  resolve: (value: Calibration) => void;
  reject: (error: Error) => void;
}
const validCalibration = (value: unknown): value is Calibration => {
  const c = value as Calibration | undefined;
  return (
    !!c &&
    [c.neutralX, c.neutralY, c.rangeX, c.rangeY].every(Number.isFinite) &&
    c.rangeX > 0.01 &&
    c.rangeY > 0.01
  );
};
const median = (numbers: number[]) => {
  const n = [...numbers].sort((a, b) => a - b);
  return n[Math.floor(n.length / 2)];
};
const quantile = (numbers: number[], q: number) => {
  const n = [...numbers].sort((a, b) => a - b);
  return n[Math.floor((n.length - 1) * q)];
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
  constructor(
    private video: HTMLVideoElement,
    private onSample: (sample: PointerSample) => void,
    private onStatus: (patch: Partial<SessionState>) => void,
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
      const saved = await chrome.storage.local.get(
        `calibration-${settings.pointerMode}`,
      );
      if (token !== this.generation) return;
      const calibration = saved[`calibration-${settings.pointerMode}`];
      this.calibrated = validCalibration(calibration);
      if (validCalibration(calibration))
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
      await this.video.play();
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
      this.schedule(token);
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
        this.busy = true;
        this.busySince = performance.now();
        if (this.worker) {
          const worker = this.worker;
          const epoch = this.frameEpoch;
          void createImageBitmap(this.video)
            .then((bitmap) => {
              if (
                token !== this.generation ||
                this.paused ||
                worker !== this.worker ||
                epoch !== this.frameEpoch
              ) {
                bitmap.close();
                if (token === this.generation) this.busy = false;
                return;
              }
              worker.postMessage(
                { type: "frame", bitmap, timestamp: this.busySince, epoch },
                [bitmap],
              );
            })
            .catch((error) => {
              if (token === this.generation) {
                this.busy = false;
                this.loss();
                void this.recoverWorker(token, new Error(String(error)));
              }
            });
        } else if (this.model) {
          try {
            const start = performance.now();
            const point = this.model.detect(this.video, start);
            this.accept(point, start, performance.now() - start);
          } catch (error) {
            this.loss();
            this.pause();
            this.onStatus({
              camera: `Tracking failed. Stop and restart: ${String(error)}`,
            });
          } finally {
            this.busy = false;
          }
        } else this.busy = false;
      },
      this.model ? 66 : 33,
    );
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
      if (time - run.start < 2500) run.neutral.push(point);
      else run.range.push(point);
    }
    const position = this.filter.update(point, time, this.settings);
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
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const run: CalibrationRun = {
        start,
        neutral: [],
        range: [],
        resolve,
        reject,
        timer: setInterval(() => {
          const elapsed = performance.now() - start;
          onProgress?.(
            Math.min(1, elapsed / 8000),
            elapsed < 2500
              ? "Hold your comfortable neutral position."
              : "Move comfortably left, right, up and down.",
          );
          if (elapsed < 8000) return;
          clearInterval(run.timer);
          if (this.calibrationRun !== run) return;
          this.calibrationRun = null;
          if (token !== this.generation || this.paused) {
            reject(new Error("Calibration cancelled"));
            return;
          }
          if (run.neutral.length < 10 || run.range.length < 10) {
            reject(
              new Error(
                "Not enough reliable tracking. Improve lighting, face the camera and try again.",
              ),
            );
            return;
          }
          const neutralX = median(run.neutral.map((p) => p.x)),
            neutralY = median(run.neutral.map((p) => p.y));
          const rangeX = quantile(
              run.range.map((p) => Math.abs(p.x - neutralX)),
              0.95,
            ),
            rangeY = quantile(
              run.range.map((p) => Math.abs(p.y - neutralY)),
              0.95,
            );
          if (rangeX < 0.025 || rangeY < 0.025) {
            reject(
              new Error(
                "Move a little farther horizontally and vertically, then recalibrate.",
              ),
            );
            return;
          }
          const calibration = { neutralX, neutralY, rangeX, rangeY };
          this.filter.setCalibration(calibration);
          this.calibrated = true;
          chrome.storage.local
            .set({ [`calibration-${this.settings.pointerMode}`]: calibration })
            .then(() => {
              if (token === this.generation) {
                this.onStatus({ camera: "Calibrated. Camera ready" });
                resolve(calibration);
              } else reject(new Error("Calibration cancelled"));
            })
            .catch((error) =>
              reject(new Error(`Could not save calibration: ${String(error)}`)),
            );
        }, 100),
      };
      this.calibrationRun = run;
      onProgress?.(0, "Hold your comfortable neutral position.");
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
      void this.start(settings)
        .then(() => {
          if (wasPaused && this.active) this.pause();
        })
        .catch(() => {});
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
    this.stream = null;
    this.video.srcObject = null;
    this.busy = false;
    this.lastVideoTime = -1;
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
