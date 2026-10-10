import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { SpeechAdapter, installLocalSpeech } from "../src/speech";
import { defaults } from "../src/shared";
class Recognition {
  static instances: Recognition[] = [];
  static available = vi.fn(async () => "available");
  static install = vi.fn(async () => true);
  processLocally = false;
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: null | (() => void) = null;
  onend: null | (() => void) = null;
  onerror: null | ((event: any) => void) = null;
  onresult: null | ((event: any) => void) = null;
  start = vi.fn(() => {
    queueMicrotask(() => this.onstart?.());
  });
  abort = vi.fn();
  constructor() {
    Recognition.instances.push(this);
  }
}
beforeEach(() => {
  Recognition.instances = [];
  Recognition.available.mockResolvedValue("available");
  vi.stubGlobal("SpeechRecognition", Recognition);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("speech adapter", () => {
  it("defaults to local speech and never downloads a language pack implicitly", async () => {
    const speech = new SpeechAdapter(vi.fn(), vi.fn());
    await speech.start(defaults);
    expect(Recognition.instances.at(-1)?.processLocally).toBe(true);
    expect(Recognition.install).not.toHaveBeenCalled();
    speech.stop();
  });
  it("blocks local recognition when no language pack is installed", async () => {
    Recognition.available.mockResolvedValue("downloadable");
    const status = vi.fn(),
      speech = new SpeechAdapter(vi.fn(), status);
    await expect(speech.start(defaults)).rejects.toThrow(/language pack/i);
    expect(
      Recognition.instances.every((r) => r.start.mock.calls.length === 0),
    ).toBe(true);
    expect(Recognition.install).not.toHaveBeenCalled();
  });
  it("only installs on an explicit call", async () => {
    Recognition.available.mockResolvedValue("downloadable");
    await installLocalSpeech("en-US");
    expect(Recognition.install).toHaveBeenCalledWith({
      langs: ["en-US"],
      processLocally: true,
    });
  });
  it("ignores partial transcripts and late results after pause", async () => {
    const heard = vi.fn(),
      speech = new SpeechAdapter(heard, vi.fn());
    await speech.start(defaults);
    const r = Recognition.instances.at(-1)!;
    const callback = r.onresult!;
    callback({
      resultIndex: 0,
      results: [{ isFinal: false, 0: { transcript: "click" } }],
    });
    expect(heard).not.toHaveBeenCalled();
    callback({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "click this" } }],
    });
    expect(heard).toHaveBeenCalledWith("click this");
    speech.pause();
    callback({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "submit" } }],
    });
    expect(heard).toHaveBeenCalledTimes(1);
    expect(r.abort).toHaveBeenCalled();
  });
  it("can use browser speech only with the selected browser setting", async () => {
    const speech = new SpeechAdapter(vi.fn(), vi.fn());
    await speech.start({ ...defaults, speechMode: "browser" });
    expect(Recognition.instances.at(-1)?.processLocally).toBe(false);
    expect(Recognition.available).not.toHaveBeenCalled();
    speech.stop();
  });
  it("does not revive an abandoned start after asynchronous availability check", async () => {
    let release!: (value: string) => void;
    Recognition.available.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const speech = new SpeechAdapter(vi.fn(), vi.fn());
    const starting = speech.start(defaults);
    speech.stop();
    release("available");
    await starting;
    expect(
      Recognition.instances.every((r) => r.start.mock.calls.length === 0),
    ).toBe(true);
  });
  it("bounds repeated recognition restarts and reports a repair action", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const status = vi.fn(),
      speech = new SpeechAdapter(vi.fn(), status);
    await speech.start(defaults);
    for (let i = 0; i < 5; i++) {
      Recognition.instances.at(-1)?.onend?.();
      await vi.advanceTimersByTimeAsync(1500);
    }
    expect(Recognition.instances).toHaveLength(5);
    expect(status).toHaveBeenLastCalledWith(
      expect.stringContaining("repeated interruptions"),
    );
    await vi.advanceTimersByTimeAsync(10000);
    expect(Recognition.instances).toHaveLength(5);
    speech.stop();
  });
  it("does not restart after permission denial", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const status = vi.fn(),
      speech = new SpeechAdapter(vi.fn(), status);
    await speech.start(defaults);
    const r = Recognition.instances.at(-1)!;
    const end = r.onend!;
    r.onerror?.({ error: "not-allowed" });
    end();
    await vi.advanceTimersByTimeAsync(5000);
    expect(Recognition.instances).toHaveLength(1);
    expect(status).toHaveBeenLastCalledWith(
      expect.stringContaining("Microphone denied"),
    );
  });
});
