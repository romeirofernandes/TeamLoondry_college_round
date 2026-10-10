import {afterEach,it,expect,vi} from "vitest";
import {Tracker} from "./tracker";
afterEach(()=>vi.unstubAllGlobals());
it("shutdown waits for a pending camera permission result and closes its eventual stream",async()=>{
 let resolve!:(v:any)=>void;const stopped=vi.fn();vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:()=>new Promise(r=>resolve=r)}});
 const tracker=new Tracker(),video={srcObject:null,play:vi.fn()} as unknown as HTMLVideoElement;
 const start=tracker.start(video,"face",vi.fn(),vi.fn());const expected=expect(start).rejects.toThrow(/cancelled/);let released=false;
 const shutdown=tracker.shutdown().then(()=>{released=true;});await Promise.resolve();expect(released).toBe(false);
 resolve({getTracks:()=>[{stop:stopped}]});await expected;await shutdown;expect(stopped).toHaveBeenCalledOnce();expect(video.play).not.toHaveBeenCalled();
});
it("shutdown cancels model initialization immediately rather than waiting twenty seconds",async()=>{
 const stopped=vi.fn(),terminate=vi.fn();let posted=false;
 vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:stopped}],getVideoTracks:()=>[]})}});
 vi.stubGlobal("location",{origin:"http://localhost"});
 vi.stubGlobal("Worker",class {terminate=terminate;postMessage(){posted=true;}});
 const tracker=new Tracker(),video={srcObject:null,play:async()=>{}} as unknown as HTMLVideoElement;
 const start=tracker.start(video,"face",vi.fn(),vi.fn());const expected=expect(start).rejects.toThrow(/cancelled/);
 for(let i=0;i<5&&!posted;i++)await Promise.resolve();expect(posted).toBe(true);
 await tracker.shutdown();await expected;expect(stopped).toHaveBeenCalledOnce();expect(terminate).toHaveBeenCalledOnce();expect(video.srcObject).toBeNull();
});
