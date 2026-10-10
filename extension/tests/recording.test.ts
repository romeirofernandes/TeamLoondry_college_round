import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecordedSpeech } from "../src/recording";
let amplitude = 0.1;
let failResume = false;
let failSend = false;
const trackStop = vi.fn(), close = vi.fn(async () => {}), sendMessage = vi.fn(async () => {
  if (failSend) return { ok: false, error: "Groq speech credentials were rejected." };
  return { text: "scroll down" };
});
class AudioContextMock {
  resume = vi.fn(async () => { if (failResume) throw new Error("audio context blocked"); });
  close = close;
  createAnalyser = () => ({ fftSize: 1024, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(amplitude) });
  createMediaStreamSource = () => ({ connect: vi.fn() });
}
class RecorderMock {
  static instance: RecorderMock;
  static isTypeSupported = () => true;
  mimeType = "audio/webm"; state = "inactive";
  ondataavailable: any; onstop: any;
  constructor() { RecorderMock.instance = this; }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["audio"]) }); this.onstop?.(); }
}
beforeEach(() => {
  amplitude = 0.1; failResume = false; failSend = false;
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: trackStop }] }) } });
  vi.stubGlobal("AudioContext", AudioContextMock); vi.stubGlobal("MediaRecorder", RecorderMock);
  vi.stubGlobal("chrome", { runtime: { sendMessage } });
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("releases microphone and context when capture setup fails", async () => {
  failResume = true;
  const recording = new RecordedSpeech(vi.fn(), vi.fn());
  await expect(recording.start("en-US")).rejects.toThrow("audio context blocked");
  expect(trackStop).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
  recording.stop();
});
it("does not send a stopped recording when audio serialization finishes late", async () => {
  let release!: (buffer: ArrayBuffer) => void;
  vi.spyOn(Blob.prototype, "arrayBuffer").mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const recording = new RecordedSpeech(vi.fn(), vi.fn());
  await recording.start("en-US"); await vi.advanceTimersByTimeAsync(200);
  amplitude = 0; await vi.advanceTimersByTimeAsync(750);
  recording.stop(); release(new ArrayBuffer(2));
  await vi.advanceTimersByTimeAsync(0);
  expect(sendMessage).not.toHaveBeenCalled();
});
it("preserves transcription failure status until a new utterance", async () => {
  failSend = true;
  vi.spyOn(Blob.prototype, "arrayBuffer").mockResolvedValue(new ArrayBuffer(2));
  const status = vi.fn(), recording = new RecordedSpeech(vi.fn(), status);
  await recording.start("en-US"); await vi.advanceTimersByTimeAsync(200);
  amplitude = 0; await vi.advanceTimersByTimeAsync(750);
  await vi.advanceTimersByTimeAsync(0);
  expect(status).toHaveBeenLastCalledWith("Groq speech credentials were rejected.");
  recording.stop();
});
it("keeps the microphone recorder ready before speech and accepts a short click utterance", async () => {
  amplitude = 0;
  vi.spyOn(Blob.prototype, "arrayBuffer").mockResolvedValue(new ArrayBuffer(2));
  const heard = vi.fn(), recording = new RecordedSpeech(heard, vi.fn());
  await recording.start("en-US");
  expect(RecorderMock.instance.state).toBe("recording");
  await vi.advanceTimersByTimeAsync(200);
  amplitude = 0.1; await vi.advanceTimersByTimeAsync(100);
  amplitude = 0; await vi.advanceTimersByTimeAsync(750);
  expect(sendMessage).toHaveBeenCalledOnce();
  recording.stop();
});
