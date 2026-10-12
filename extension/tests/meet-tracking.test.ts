import {it,expect,vi} from 'vitest';
import {Tracker} from '../src/tracking';
it('does not reconfigure the vision model when refreshing the same enabled pose input',async()=>{
 const tracker=new Tracker({} as HTMLVideoElement,()=>{},()=>{});const options=vi.fn(async()=>{}),post=vi.fn();
 // Transport fixture: attach the same worker/model that start normally owns.
 (tracker as any).worker={postMessage:post};(tracker as any).model={setPoseEnabled:options};
 tracker.setPoseListener(()=>{});tracker.setPoseListener(()=>{});tracker.setPoseListener(()=>{});await Promise.resolve();
 expect(post).toHaveBeenCalledTimes(1);expect(options).toHaveBeenCalledTimes(1);
 tracker.setPoseListener(null);tracker.setPoseListener(null);await Promise.resolve();expect(post).toHaveBeenCalledTimes(2);
});
