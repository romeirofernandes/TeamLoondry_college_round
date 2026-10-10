import {it,expect,vi,afterEach} from "vitest";
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it("a release racing a pending claim leaves no owned lease or heartbeat",async()=>{
 vi.resetModules();vi.useFakeTimers();const messages:any[]=[];let receiver!:(v:any)=>void,disconnect!:()=>void;
 const port={onMessage:{addListener:(f:any)=>receiver=f},onDisconnect:{addListener:(f:any)=>disconnect=f},disconnect:()=>disconnect(),postMessage:(m:any)=>{messages.push(m);if(m.type==="hello")queueMicrotask(()=>receiver({id:m.id,ok:true,result:{protocol:1}}));}};
 vi.stubGlobal("chrome",{runtime:{connectNative:()=>port,lastError:undefined},storage:{local:{get:async()=>({desktopPaired:true})}}});
 const desktop=await import("../src/desktop");const lost=vi.fn();desktop.onDesktopLost(lost);
 const claim=desktop.claimDesktop();for(let i=0;i<20&&!messages.find(m=>m.type==="claim");i++)await Promise.resolve();
 const release=desktop.releaseDesktop();const claimMessage=messages.find(m=>m.type==="claim"),releaseMessage=messages.find(m=>m.type==="release");expect(claimMessage).toBeDefined();expect(releaseMessage).toBeDefined();
 receiver({id:claimMessage.id,ok:true,result:{owner:"browser"}});await claim;
 receiver({id:releaseMessage.id,ok:true,result:{owner:"none"}});await release;
 const count=messages.length;await vi.advanceTimersByTimeAsync(2000);expect(messages.length).toBe(count);disconnect();expect(lost).not.toHaveBeenCalled();
});
