export type {Calibration,PointerMode} from "../../shared/tracking/types";
import type {Calibration,PointerMode} from "../../shared/tracking/types";
export interface TrackingSettings { pointerMode:PointerMode; confidenceThreshold:number; deadZone:number; sensitivity:number; handSensitivity:number; }
export interface Session { phase:"stopped"|"running"|"paused";epoch:number;reason:string;displayId:number; }
export interface Display { id:number;x:number;y:number;width:number;height:number; }
export interface Status {session:Session;capabilities:{version:string;os:string;arch:string;nativeControl:boolean;inputAccess:boolean;accessibilityApi:boolean;displays:Display[];};}
export interface Preferences {enabledInputs:("face"|"hand"|"voice")[];mode:PointerMode;sensitivity:number;dwell:boolean;calibrations:Partial<Record<PointerMode,Calibration>>;}
export const defaultPreferences:Preferences={enabledInputs:["face"],mode:"face",sensitivity:1,dwell:false,calibrations:{}};
export function readPreferences(raw:string|null):Preferences {
  try {
    const v=JSON.parse(raw??"null"); if(!v||v.version!==1)return {...defaultPreferences,calibrations:{}};
    const calibrations:Preferences["calibrations"]={};
    for(const mode of ["face","hand"] as const){const c=v.calibrations?.[mode];if(c&&[c.neutralX,c.neutralY,c.rangeX,c.rangeY].every((n:unknown)=>typeof n==="number"&&Number.isFinite(n))&&c.rangeX>=0.008&&c.rangeY>=0.008&&[c.left,c.right,c.up,c.down,c.positiveX,c.negativeX,c.positiveY,c.negativeY].every((n:unknown)=>n===undefined||typeof n==="number"&&Number.isFinite(n)&&n>=0.008)&&[c.invertX,c.invertY].every((b:unknown)=>b===undefined||typeof b==="boolean"))calibrations[mode]=c;}
    const enabledInputs:Preferences["enabledInputs"]=Array.isArray(v.enabledInputs)?[...new Set(v.enabledInputs.filter((x:unknown)=>x==="face"||x==="hand"||x==="voice"))] as Preferences["enabledInputs"]:[v.mode==="hand"?"hand":"face"];
    return {enabledInputs:enabledInputs.length?enabledInputs:["face"],mode:v.mode==="hand"?"hand":"face",sensitivity:typeof v.sensitivity==="number"&&Number.isFinite(v.sensitivity)?Math.max(0.2,Math.min(4,v.sensitivity)):1,dwell:v.dwell===true,calibrations};
  }catch{return {...defaultPreferences,calibrations:{}};}
}
