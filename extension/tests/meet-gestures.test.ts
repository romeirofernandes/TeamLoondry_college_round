import {it,expect} from 'vitest';
import {MeetGestureGate,HeadCalibration,poseFromMatrix} from '../src/meet/gestures';
it('fires once after hold, requires neutral and rejects lost or stale pose',()=>{
 const gate=new MeetGestureGate();gate.update(null,true,-600,700,1200);gate.update(null,true,-200,700,1200);expect(gate.update('lean-left',true,0,700,1200)).toBe(false);gate.update('lean-left',true,400,700,1200);expect(gate.update('lean-left',true,800,700,1200)).toBe(true);expect(gate.update('lean-left',true,4000,700,1200)).toBe(false);
 gate.update(null,true,4100,700,1200);gate.update(null,true,4500,700,1200);expect(gate.update('lean-left',true,4600,700,1200)).toBe(false);expect(gate.update('lean-left',false,5500,700,1200)).toBe(false);expect(gate.update('lean-left',true,5600,700,1200)).toBe(false);
});
it('calibrates comfortable relative pose and rejects an imperceptible movement',()=>{
 const c=new HeadCalibration('lean-left',0);for(let t=0;t<2000;t+=100)c.sample({pitch:0,roll:0.05,quality:1},t);for(let t=2000;t<=4200;t+=100)c.sample({pitch:0,roll:-0.25,quality:1},t);
 expect(c.result()).toMatchObject({gesture:'lean-left',neutral:0.05});expect(c.result()!.threshold).toBeCloseTo(0.15);
});
it('derives orientation from a finite transform and rejects invalid matrices',()=>{
 expect(poseFromMatrix([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],1)).toMatchObject({pitch:0,roll:0,quality:1});expect(poseFromMatrix([NaN],1)).toBeNull();
});
it('does not trigger on non-finite or out-of-order pose timestamps',()=>{
 const gate=new MeetGestureGate();gate.update('lean-left',true,0,700,1200);gate.update('lean-left',true,400,700,1200);
 expect(gate.update('lean-left',true,NaN,700,1200)).toBe(false);
 expect(gate.update('lean-left',true,300,700,1200)).toBe(false);
});
it('requires an observed neutral pose after entering or resetting a Meet context',()=>{
 const gate=new MeetGestureGate();for(let t=0;t<=1200;t+=200)expect(gate.update('lean-left',true,t,700,1200)).toBe(false);
 gate.update(null,true,1400,700,1200);gate.update(null,true,1800,700,1200);gate.update('lean-left',true,2000,700,1200);gate.update('lean-left',true,2400,700,1200);expect(gate.update('lean-left',true,2800,700,1200)).toBe(true);
 gate.reset();for(let t=3000;t<=4200;t+=200)expect(gate.update('lean-left',true,t,700,1200)).toBe(false);
});
