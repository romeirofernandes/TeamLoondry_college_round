export type PointerMode = "face" | "hand";
export interface Calibration { neutralX:number; neutralY:number; rangeX:number; rangeY:number; left?:number;right?:number;up?:number;down?:number;positiveX?:number;negativeX?:number;positiveY?:number;negativeY?:number;invertX?:boolean;invertY?:boolean; }
export interface Settings {pointerMode:PointerMode;confidenceThreshold:number;deadZone:number;sensitivity:number;handSensitivity:number;}
