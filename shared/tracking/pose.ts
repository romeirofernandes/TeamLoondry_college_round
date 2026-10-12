export interface HeadPose {pitch:number;roll:number;quality:number}
export function poseFromMatrix(data:number[],quality:number):HeadPose|null{
 if(data.length!==16||!data.every(Number.isFinite)||!Number.isFinite(quality)||quality<0.7)return null;
 const scale=Math.hypot(data[0],data[1],data[2]);if(scale<0.001)return null;
 // MediaPipe exposes a flattened 4x4 transform. Calibration establishes user-facing direction.
 return {roll:Math.atan2(data[1],data[0]),pitch:Math.atan2(-data[6],data[10])||0,quality};
}
