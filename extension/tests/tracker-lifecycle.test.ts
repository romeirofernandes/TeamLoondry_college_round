import {
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
  type Mock,
} from "vitest";
import { Tracker } from "../src/tracking";
import { defaults } from "../src/shared";

class WorkerMock {
  static instances: WorkerMock[] = [];
  onmessage: ((event: any) => void) | null = null;
  onerror: any = null;
  terminate = vi.fn();
  frames: any[] = [];
  constructor() {
    WorkerMock.instances.push(this);
  }
  postMessage(data: any) {
    if (data.type === "init")
      queueMicrotask(() => this.onmessage?.({ data: { type: "ready" } }));
    else this.frames.push(data);
  }
  emit(data: any) {
    this.onmessage?.({ data });
  }
}
const streamStop = vi.fn();
const stream = {
  getTracks: () => [{ stop: streamStop }],
  getVideoTracks: () => [{ addEventListener: vi.fn() }],
};
function video() {
  return {
    srcObject: null,
    muted: false,
    playsInline: false,
    play: vi.fn(async () => {}),
    readyState: 2,
    currentTime: 1,
  } as unknown as HTMLVideoElement;
}
beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "performance",
    ],
  });
  WorkerMock.instances = [];
  vi.stubGlobal("Worker", WorkerMock);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ close: vi.fn() })),
  );
  vi.stubGlobal("chrome", {
    runtime: { getURL: (path: string) => "chrome-extension://test/" + path },
    storage: {
      local: {
        get: vi.fn(async () => ({
          "calibration-face": {
            neutralX: 0.5,
            neutralY: 0.5,
            rangeX: 0.2,
            rangeY: 0.2,
          },
        })),
        set: vi.fn(async () => {}),
      },
    },
  });
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: vi.fn(async () => stream) },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("tracker lifecycle", () => {
  it("closes a late camera stream after start has been cancelled", async () => {
    let release!: (stream: any) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const preview = video(),
      tracker = new Tracker(preview, vi.fn(), vi.fn());
    const starting = tracker.start(defaults);
    await Promise.resolve();
    tracker.stop();
    release(stream);
    await starting;
    expect(streamStop).toHaveBeenCalled();
    expect(preview.srcObject).toBeNull();
    expect(WorkerMock.instances).toHaveLength(0);
  });
  it("rejects stale worker frames after pause and resume", async () => {
    const preview = video(),
      sample = vi.fn(),
      tracker = new Tracker(preview, sample, vi.fn());
    await tracker.start(defaults);
    await vi.advanceTimersByTimeAsync(34);
    const worker = WorkerMock.instances[0],
      frame = worker.frames[0];
    expect(frame.type).toBe("frame");
    tracker.pause();
    tracker.resume();
    sample.mockClear();
    worker.emit({
      type: "sample",
      point: { x: 0.6, y: 0.5, confidence: 1 },
      timestamp: frame.timestamp,
      latencyMs: 2,
      epoch: frame.epoch,
    });
    expect(sample).not.toHaveBeenCalled();
    tracker.stop();
  });
  it("emits loss instead of reactivating a delayed worker result", async () => {
    const preview = video(),
      sample = vi.fn(),
      tracker = new Tracker(preview, sample, vi.fn());
    await tracker.start(defaults);
    await vi.advanceTimersByTimeAsync(34);
    const worker = WorkerMock.instances[0],
      frame = worker.frames[0];
    await vi.advanceTimersByTimeAsync(400);
    sample.mockClear();
    worker.emit({
      type: "sample",
      point: { x: 0.6, y: 0.5, confidence: 1 },
      timestamp: frame.timestamp,
      latencyMs: 2,
      epoch: frame.epoch,
    });
    expect(sample).toHaveBeenLastCalledWith(
      expect.objectContaining({ confidence: 0, handHold: false }),
    );
    tracker.stop();
  });
  it("blocks pointing until a reliable calibration exists and releases camera on stop", async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValueOnce({});
    const preview = video(),
      sample = vi.fn(),
      tracker = new Tracker(preview, sample, vi.fn());
    await tracker.start(defaults);
    await vi.advanceTimersByTimeAsync(34);
    const worker = WorkerMock.instances[0],
      frame = worker.frames[0];
    worker.emit({
      type: "sample",
      point: { x: 0.5, y: 0.5, confidence: 1 },
      timestamp: frame.timestamp,
      latencyMs: 2,
      epoch: frame.epoch,
    });
    expect(sample).toHaveBeenLastCalledWith(
      expect.objectContaining({ confidence: 0, handHold: false }),
    );
    tracker.stop();
    expect(worker.terminate).toHaveBeenCalled();
    expect(streamStop).toHaveBeenCalled();
    expect(preview.srcObject).toBeNull();
  });
  it("calibrates neutral and comfortable range in eight seconds while blocking selection", async () => {
    const preview = video(),
      sample = vi.fn(),
      progress = vi.fn(),
      tracker = new Tracker(preview, sample, vi.fn());
    await tracker.start(defaults);
    const calibration = tracker.calibrate(progress);
    const worker = WorkerMock.instances[0];
    sample.mockClear();
    for (let index = 0; index < 238; index++) {
      preview.currentTime += 0.034;
      await vi.advanceTimersByTimeAsync(34);
      const frame = worker.frames.at(-1);
      const moving = performance.now() > 2500;
      const offset = moving ? (index % 2 === 0 ? 0.1 : -0.1) : 0;
      worker.emit({
        type: "sample",
        point: { x: 0.5 + offset, y: 0.5 + offset, confidence: 1 },
        timestamp: frame.timestamp,
        latencyMs: 2,
        epoch: frame.epoch,
      });
      if (performance.now() < 8000)
        expect(sample).toHaveBeenLastCalledWith(
          expect.objectContaining({ confidence: 0, handHold: false }),
        );
    }
    const result = await calibration;
    expect(result.neutralX).toBeCloseTo(0.5);
    expect(result.rangeX).toBeCloseTo(0.1);
    expect(result.rangeY).toBeCloseTo(0.1);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      "calibration-face": result,
    });
    expect(progress).toHaveBeenLastCalledWith(1, expect.any(String));
    tracker.stop();
  });
});
