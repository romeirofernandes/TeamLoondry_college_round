import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defaults } from "../src/shared";
const mocks = vi.hoisted(() => ({ speech: [] as any[], fallback: [] as any[], trackers: [] as any[], fail: true }));
vi.mock("../src/tracking", () => ({ Tracker: class { constructor() { mocks.trackers.push(this); } calibrate = vi.fn(async (_progress: any) => {}); start = vi.fn(async () => {}); stop = vi.fn(); pause = vi.fn(); resume = vi.fn(); updateSettings = vi.fn(); } }));
vi.mock("../src/speech", () => ({ SpeechAdapter: class {
  constructor(public heard: any, public status: any) { mocks.speech.push(this); }
  start = vi.fn(async () => { if (mocks.fail) { this.status("Speech service could not connect"); throw new Error("network"); } });
  stop = vi.fn(); pause = vi.fn();
} }));
vi.mock("../src/recording", () => ({ RecordedSpeech: class {
  constructor(public heard: any, public status: any) { mocks.fallback.push(this); }
  start = vi.fn(async () => {}); stop = vi.fn();
} }));
let command: (message: any, sender: any, respond: any) => void;
let providerStatus: () => Promise<any>;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
beforeEach(async () => {
  vi.resetModules(); mocks.speech = []; mocks.fallback = []; mocks.trackers = []; mocks.fail = true;
  providerStatus = async () => ({ groqKeyCount: 5 });
  vi.stubGlobal("document", { querySelector: () => ({}) });
  vi.stubGlobal("chrome", { runtime: {
    onMessage: { addListener: (listener: any) => { command = listener; } },
    sendMessage: vi.fn(async (message: any) => message.type === "GET_PROVIDER_STATUS" ? providerStatus() : { ok: true }),
  } });
  await import("../src/offscreen");
});
afterEach(() => { command({ type: "OFFSCREEN_COMMAND", command: "stop" }, {}, () => {}); vi.unstubAllGlobals(); });
const dispatch = (name: string, settings = defaults) => command({ type: "OFFSCREEN_COMMAND", command: name, settings }, {}, () => {});
it("starts only one cloud microphone when network error and startup rejection both request fallback", async () => {
  dispatch("start"); await flush();
  expect(mocks.fallback).toHaveLength(1);
});
it("does not revive an old fallback after pause and resume", async () => {
  let release!: (value: any) => void;
  providerStatus = () => new Promise(resolve => { release = resolve; });
  dispatch("start"); await flush();
  dispatch("pause"); mocks.fail = false; dispatch("resume"); await flush();
  release({ groqKeyCount: 5 }); await flush();
  expect(mocks.fallback).toHaveLength(0);
});
it("ignores callbacks from speech replaced by a language change", async () => {
  mocks.fail = false; dispatch("start"); await flush();
  const abandoned = mocks.speech[0];
  dispatch("settings", { ...defaults, language: "hi-IN" }); await flush();
  abandoned.status("Speech service could not connect"); await flush();
  expect(mocks.fallback).toHaveLength(0);
});

it("does not publish calibration progress or success from a stopped session", async () => {
  mocks.fail = false; dispatch("start"); await flush();
  let finish!: () => void;
  let progress!: (value: number) => void;
  mocks.trackers[0].calibrate.mockImplementation((callback: any) => {
    progress = callback;
    return new Promise<void>(resolve => { finish = resolve; });
  });
  dispatch("calibrate"); await flush(); dispatch("stop");
  const send = vi.mocked(chrome.runtime.sendMessage); send.mockClear();
  progress(0.5); finish(); await flush();
  expect(send).not.toHaveBeenCalled();
});
