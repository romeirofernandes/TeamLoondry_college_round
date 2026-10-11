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
  vi.stubGlobal("chrome", { storage: { local: { get: vi.fn(async () => ({})) } }, runtime: {
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
it("keeps final speech available for session controls while pointing is paused", async () => {
  mocks.fail = false; dispatch("start"); await flush();
  dispatch("pause"); await flush();
  const pausedSpeech = mocks.speech.at(-1);
  const send = vi.mocked(chrome.runtime.sendMessage); send.mockClear();
  pausedSpeech.heard("resume handsfree"); await flush();
  expect(send).toHaveBeenCalledWith({ type: "HEARD", text: "resume handsfree" });
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "TRANSCRIPT" }));
  expect(mocks.trackers[0].pause).toHaveBeenCalled();
});

it("starts speech without opening the camera in voice-only mode", async () => {
 mocks.fail=false;dispatch("start",{...defaults,voiceOnly:true});await flush();
 expect(mocks.trackers).toHaveLength(0);expect(mocks.speech).toHaveLength(1);
 expect(mocks.speech[0].start).toHaveBeenCalled();
});
it("never opens a microphone for head and hand control without voice", async () => {
 mocks.fail=false;dispatch("start",{...defaults,enabledInputs:["face","hand"]});await flush();
 dispatch("pause");dispatch("resume");await flush();
 expect(mocks.trackers).toHaveLength(1);expect(mocks.speech).toHaveLength(0);expect(mocks.fallback).toHaveLength(0);
});
it("releases speech when voice is deselected and starts it when selected again",async()=>{
 mocks.fail=false;dispatch("start");await flush();const old=mocks.speech[0];
 dispatch("settings",{...defaults,enabledInputs:["face"]});await flush();expect(old.stop).toHaveBeenCalled();
 const send=vi.mocked(chrome.runtime.sendMessage);send.mockClear();old.heard("new tab");await flush();expect(send).not.toHaveBeenCalledWith(expect.objectContaining({type:"HEARD"}));
 dispatch("settings",{...defaults,enabledInputs:["voice","face"]});await flush();expect(mocks.speech).toHaveLength(2);
});
it("routes setup speech without starting tracking or sending page transcripts",async()=>{
 mocks.fail=false;dispatch("ui-start");await flush();
 expect(mocks.trackers).toHaveLength(0);const send=vi.mocked(chrome.runtime.sendMessage);send.mockClear();
 mocks.speech[0].heard("choose voice");await flush();expect(send).toHaveBeenCalledWith({type:"UI_HEARD",text:"choose voice"});
 expect(send).not.toHaveBeenCalledWith(expect.objectContaining({type:"TRANSCRIPT"}));
 dispatch("ui-stop");send.mockClear();mocks.speech[0].heard("new tab");await flush();expect(send).not.toHaveBeenCalled();
});
it("releases a setup microphone when its dashboard lease expires",async()=>{
 vi.useFakeTimers();mocks.fail=false;dispatch("ui-start");await flush();const speech=mocks.speech[0];
 await vi.advanceTimersByTimeAsync(15001);expect(speech.stop).toHaveBeenCalled();
 const send=vi.mocked(chrome.runtime.sendMessage);send.mockClear();speech.heard("next");await flush();expect(send).not.toHaveBeenCalled();vi.useRealTimers();
});
it("suspends recognition during feedback and ignores echo before resuming", async () => {
 vi.useFakeTimers();mocks.fail=false;
 let utterance:any;
 vi.stubGlobal("SpeechSynthesisUtterance",class {constructor(public text:string){} });
 vi.stubGlobal("speechSynthesis",{cancel:vi.fn(),speak:vi.fn(u=>{utterance=u;})});
 dispatch("start",{...defaults,voiceOnly:true,spokenFeedback:true});await flush();
 const old=mocks.speech[0];command({type:"SPEAK_FEEDBACK",text:"Choose one or two",enabled:true},{},()=>{});await flush();
 expect(old.stop).toHaveBeenCalled();const send=vi.mocked(chrome.runtime.sendMessage);send.mockClear();old.heard("like this");await flush();expect(send).not.toHaveBeenCalledWith(expect.objectContaining({type:"HEARD"}));
 utterance.onend();await vi.advanceTimersByTimeAsync(400);await flush();expect(mocks.speech).toHaveLength(2);
 mocks.speech[1].heard("choose two");await flush();expect(send).toHaveBeenCalledWith({type:"HEARD",text:"choose two"});
 dispatch("stop");vi.useRealTimers();
});

it.each([true,false])("preserves pause when voice-only changes to %s",async voiceOnly=>{
 mocks.fail=false;dispatch("start",{...defaults,voiceOnly:!voiceOnly});await flush();dispatch("pause");await flush();
 const count=mocks.trackers.length;dispatch("settings",{...defaults,voiceOnly});await flush();expect(mocks.trackers.length).toBe(count);
 const send=vi.mocked(chrome.runtime.sendMessage);send.mockClear();mocks.speech.at(-1).heard("scroll down");await flush();expect(send).not.toHaveBeenCalledWith(expect.objectContaining({type:"TRANSCRIPT"}));
 dispatch("resume");await flush();expect(mocks.trackers.length).toBe(count+(voiceOnly ? 0 : 1));
});
it('privacy stops capture and blocks settings, pause, UI and narration restarts until explicit exit',async()=>{
 mocks.fail=false;dispatch('start');await flush();const speech=mocks.speech[0];
 const ack=vi.fn();command({type:'OFFSCREEN_COMMAND',command:'private-enter'},{},ack);await flush();
 expect(speech.stop).toHaveBeenCalled();expect(ack).toHaveBeenCalledWith({ok:true,privateInput:true});
 const count=mocks.speech.length;const send=vi.mocked(chrome.runtime.sendMessage);send.mockClear();speech.heard('sentinel-secret');
 dispatch('settings',{...defaults,language:'hi-IN'});dispatch('pause');dispatch('resume');dispatch('ui-start');dispatch('narration-end');await flush();
 expect(mocks.speech).toHaveLength(count);expect(send).not.toHaveBeenCalledWith(expect.objectContaining({type:'HEARD'}));
 dispatch('private-exit');await flush();expect(mocks.speech.length).toBeGreaterThan(count);
});
it('privacy invalidates pending fallback startup',async()=>{
 let release!:(v:any)=>void;providerStatus=()=>new Promise(r=>release=r);dispatch('start');await flush();
 dispatch('private-enter');release({groqKeyCount:5});await flush();expect(mocks.fallback).toHaveLength(0);
});
it('does not acknowledge private entry until a pending microphone startup has settled',async()=>{
 dispatch('start');await flush();
 // Simulate a recorder awaiting permission; its stop invalidates generation,
 // but acknowledgement must wait for start to release any late stream.
 dispatch('stop');mocks.fallback=[];
 // A deferred provider lookup is also a pending voice-start transaction.
 let release!:(v:any)=>void;providerStatus=()=>new Promise(r=>release=r);
 dispatch('start');await flush();const ack=vi.fn();command({type:'OFFSCREEN_COMMAND',command:'private-enter'},{},ack);
 expect(ack).not.toHaveBeenCalled();release({groqKeyCount:5});await flush();
 expect(ack).toHaveBeenCalledWith({ok:true,privateInput:true});expect(mocks.fallback).toHaveLength(0);
});
it('ignores a stale private exit after a newer password-entry generation',async()=>{
 mocks.fail=false;dispatch('start');await flush();
 command({type:'OFFSCREEN_COMMAND',command:'private-enter',privateSession:'worker',privateRevision:1},{},()=>{});await flush();
 command({type:'OFFSCREEN_COMMAND',command:'private-enter',privateSession:'worker',privateRevision:2},{},()=>{});await flush();const count=mocks.speech.length;
 const ack=vi.fn();command({type:'OFFSCREEN_COMMAND',command:'private-exit',privateSession:'worker',privateRevision:1},{},ack);await flush();
 expect(mocks.speech).toHaveLength(count);expect(ack).toHaveBeenCalledWith({ok:false});
});
