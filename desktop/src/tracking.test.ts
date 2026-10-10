import { describe,it,expect } from "vitest";
import { PointerFilter,landmarkPoint } from "./math";
import { calibrationFromPoses } from "./calibration";
import { readPreferences } from "./types";
const settings={pointerMode:"face" as const,confidenceThreshold:0.7,deadZone:0.035,sensitivity:1,handSensitivity:1};
describe("tracking and recovery",()=>{
 it("freezes on loss and never accumulates lost time",()=>{const filter=new PointerFilter();const first=filter.update({x:0.6,y:0.5,confidence:1},0,settings);const lost=filter.update(null,5000,settings);expect(lost.x).toBe(first.x);const fresh=filter.update({x:0.6,y:0.5,confidence:1},9000,settings);expect(fresh.x).toBe(first.x);});
 it("rejects non-finite and incomplete landmarks",()=>{expect(landmarkPoint([],"face")).toBeNull();expect(landmarkPoint([{x:NaN,y:0.5}],"hand")).toBeNull();});
 it("requires samples in all five calibration poses",()=>{expect(()=>calibrationFromPoses({center:[],left:[],right:[],up:[],down:[]},"face")).toThrow(/center/);});
 it("accepts small comfortable directional calibration",()=>{const p=(x:number,y:number)=>Array.from({length:10},()=>({x,y,confidence:1}));const c=calibrationFromPoses({center:p(.5,.5),left:p(.55,.5),right:p(.45,.5),up:p(.5,.45),down:p(.5,.55)},"hand");expect(c.neutralX).toBe(.5);expect(c.rangeX).toBeCloseTo(.05);});
 it("rejects reversed calibration rather than inverting control",()=>{const p=(x:number,y:number)=>Array.from({length:10},()=>({x,y,confidence:1}));expect(()=>calibrationFromPoses({center:p(.5,.5),left:p(.4,.5),right:p(.6,.5),up:p(.5,.4),down:p(.5,.6)},"face")).toThrow(/left/);});
 it("clears smoothing when pointer source changes",()=>{const f=new PointerFilter();f.update({x:.5,y:.5,confidence:1},0,settings);f.update({x:.6,y:.5,confidence:1},100,settings);f.reset();const a=f.update({x:.5,y:.5,confidence:1},10000,settings);expect(a.confidence).toBe(1);expect(a.handHold).toBe(false);});
});
describe("saved preferences",()=>{
 it("recovers from malformed storage",()=>{expect(readPreferences("{").mode).toBe("face");});
 it("bounds sensitivity and rejects malformed calibrations",()=>{const p=readPreferences(JSON.stringify({version:1,sensitivity:99,calibrations:{face:{neutralX:.5,neutralY:.5,rangeX:0,rangeY:.1}}}));expect(p.sensitivity).toBe(4);expect(p.calibrations.face).toBeUndefined();});
 it("does not enable dwell through a truthy string",()=>{expect(readPreferences('{"version":1,"dwell":"false"}').dwell).toBe(false);});
 it("migrates older hand preferences and accepts voice-only inputs",()=>{expect(readPreferences('{"version":1,"mode":"hand"}').enabledInputs).toEqual(["hand"]);expect(readPreferences('{"version":1,"enabledInputs":["voice","voice","invalid"]}').enabledInputs).toEqual(["voice"]);});
 it("unknown versions keep default opt-in state",()=>{expect(readPreferences('{"version":2,"dwell":true}').dwell).toBe(false);});
});
