import {afterEach,expect,it,vi} from 'vitest';
import {captureCheck} from '../src/capture-check';
function fixture(){
 let message:(value:any)=>void=()=>{},lost:()=>void=()=>{};
 const port={onMessage:{addListener:(callback:any)=>{message=callback;}},onDisconnect:{addListener:(callback:any)=>{lost=callback;}},disconnect:vi.fn(()=>lost()),postMessage:vi.fn()};
 vi.stubGlobal('chrome',{runtime:{connect:vi.fn(()=>port)}});
 return {port,message:(value:any)=>message(value),lost:()=>lost()};
}
afterEach(()=>vi.unstubAllGlobals());
it('holds permission capture until desktop shutdown is acknowledged and awaits release',async()=>{
 const f=fixture();const pending=captureCheck();let ready=false;void pending.then(()=>{ready=true;});await Promise.resolve();expect(ready).toBe(false);
 f.message({ok:true});const release=await pending;const done=release();expect(f.port.postMessage).toHaveBeenCalledWith({release:true});expect(f.port.disconnect).not.toHaveBeenCalled();
 f.message({released:true});await done;expect(f.port.disconnect).toHaveBeenCalledTimes(1);await release();expect(f.port.postMessage).toHaveBeenCalledTimes(1);
});
it('fails closed if the permission UI disconnects before handoff',async()=>{
 const f=fixture();const pending=captureCheck();f.lost();await expect(pending).rejects.toThrow('disconnected');
});
it('releases safely when the UI connection disappears after acknowledgement',async()=>{
 const f=fixture();const pending=captureCheck();f.message({ok:true});const release=await pending;f.lost();await release();expect(f.port.postMessage).not.toHaveBeenCalled();
});
it('surfaces a native claim rejection without starting permission capture',async()=>{
 const f=fixture();const pending=captureCheck();f.message({ok:false,error:'Browser already owns capture'});await expect(pending).rejects.toThrow();expect(f.port.disconnect).toHaveBeenCalledTimes(1);
});
