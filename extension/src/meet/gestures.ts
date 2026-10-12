import type {HeadGesture,MeetMapping} from './model';
import type {HeadPose} from "../../../shared/tracking/pose";
export {poseFromMatrix,type HeadPose} from "../../../shared/tracking/pose";
export class MeetGestureGate {
 private candidate:string|null=null;private since=0;private last=-Infinity;private armed=false;private neutralSince:number|null=null;private previous=-Infinity;
 reset(){this.candidate=null;this.armed=false;this.neutralSince=null;this.previous=-Infinity;this.last=-Infinity;}
 update(gesture:string|null,quality:boolean,now:number,holdMs:number,cooldownMs:number):boolean{
  if(!Number.isFinite(now)||now<this.previous){this.candidate=null;this.neutralSince=null;return false;}
  if(now-this.previous>500){this.neutralSince=null;this.candidate=null;this.since=now;}this.previous=now;
  if(!quality){this.candidate=null;this.neutralSince=null;return false;}
  if(!gesture){this.candidate=null;this.neutralSince??=now;if(now-this.neutralSince>=300)this.armed=true;return false;}
  this.neutralSince=null;if(!this.armed||now-this.last<cooldownMs)return false;
  if(this.candidate!==gesture){this.candidate=gesture;this.since=now;return false;}
  if(now-this.since<holdMs)return false;this.armed=false;this.last=now;return true;
 }
}
export class HeadCalibration {
 private neutral:number[]=[];private target:number[]=[];
 constructor(readonly gesture:HeadGesture,readonly started:number){}
 sample(pose:HeadPose|null,now:number){if(!pose||pose.quality<0.7)return;const elapsed=now-this.started;const v=this.gesture.startsWith('lean')?pose.roll:pose.pitch;if(elapsed<2000)this.neutral.push(v);else if(elapsed<=5000)this.target.push(v);}
 result():{gesture:HeadGesture;neutral:number;threshold:number;direction:1|-1}|null{
  if(this.neutral.length<10||this.target.length<10)return null;const median=(a:number[])=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];const neutral=median(this.neutral),delta=median(this.target)-neutral;if(Math.abs(delta)<0.15||Math.abs(delta)>1)return null;
  return {gesture:this.gesture,neutral,threshold:Math.max(0.1,Math.abs(delta)*0.5),direction:delta>0?1:-1};
 }
}
export function matchHead(pose:HeadPose,mappings:MeetMapping[]):MeetMapping|null{
 if(pose.quality<0.7)return null;const candidates=mappings.filter(m=>m.enabled&&m.direction!==undefined&&((m.gesture.startsWith('lean')?pose.roll:pose.pitch)-(m.neutral??0))*m.direction>=m.threshold);
 return candidates.length===1?candidates[0]:null;
}
