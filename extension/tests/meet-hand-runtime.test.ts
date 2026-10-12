import {it,expect,vi,afterEach} from 'vitest';
import {GestureRuntime} from '../src/gesture-runtime';
import type {GesturePreset} from '../src/shared';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()});
const preset=(id='meet'):GesturePreset=>({id,name:'Meet',gesture:'fist',enabled:true,calibration:{threshold:0.6,calibratedAt:1},action:{type:'media-play'},holdMs:700,cooldownMs:1200});
function setup(){vi.useFakeTimers();let worker:any;vi.stubGlobal('chrome',{runtime:{getURL:(s:string)=>s}});vi.stubGlobal('Worker',class{onmessage:any;onerror:any;postMessage=vi.fn();terminate=vi.fn();constructor(){worker=this}});const trigger=vi.fn();const runtime=new GestureRuntime({readyState:0} as HTMLVideoElement,[preset()],trigger,()=>{});const pose=(gesture:string|null,timestamp:number)=>worker.onmessage({data:{type:'pose',gesture,confidence:1,timestamp}});return {runtime,pose,trigger};}
it('requires neutral before a newly configured Meet shortcut can fire',()=>{
 const {runtime,pose,trigger}=setup();for(let t=0;t<1500;t+=150)pose('fist',t);expect(trigger).not.toHaveBeenCalled();
 for(let t=1500;t<2100;t+=150)pose(null,t);for(let t=2100;t<3000;t+=150)pose('fist',t);expect(trigger).toHaveBeenCalledTimes(1);runtime.stop();
});
it('restarts the configured hold after a missing frame interval',()=>{
 const {runtime,pose,trigger}=setup();for(let t=0;t<600;t+=150)pose(null,t);pose('fist',600);pose('fist',750);pose('fist',3000);expect(trigger).not.toHaveBeenCalled();runtime.stop();
});
it('requires fresh neutral when switching the scoped mapping',()=>{
 const {runtime,pose,trigger}=setup();for(let t=0;t<600;t+=150)pose(null,t);pose('fist',600);pose('fist',900);runtime.update([preset('new-meeting')]);for(let t=1050;t<2100;t+=150)pose('fist',t);expect(trigger).not.toHaveBeenCalled();runtime.stop();
});
