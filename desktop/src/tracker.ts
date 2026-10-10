import type { RawPoint } from "./math";
import type { PointerMode } from "./types";
export class Tracker {
  private worker:Worker|null=null;
  private stream:MediaStream|null=null;
  private timer:ReturnType<typeof setInterval>|null=null;
  private generation=0;
  private video:HTMLVideoElement|null=null;
  async start(video:HTMLVideoElement,mode:PointerMode,onPoint:(point:RawPoint|null,time:number)=>void,onError:(message:string)=>void){
    this.stop(); const generation=this.generation;this.video=video;
    const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}},audio:false});
    if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());throw new Error("Camera setup cancelled");}
    this.stream=stream;video.srcObject=stream;
    await video.play();
    if(generation!==this.generation)throw new Error("Camera setup cancelled");
    const worker=new Worker(new URL("./vision.worker.ts",import.meta.url));this.worker=worker;
    let ready=false,busy=false,lastTime=-1;
    await new Promise<void>((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error("Tracking model took too long to load. Stop and retry.")),20000);
      worker.onerror=()=>{clearTimeout(timeout);reject(new Error("Tracking worker failed. Stop and retry."));onError("Tracking worker failed. Stop and retry.");};
      worker.onmessage=event=>{
        if(generation!==this.generation)return;
        if(event.data.type==="ready"){ready=true;clearTimeout(timeout);resolve();}
        if(event.data.type==="point"){busy=false;onPoint(event.data.point,event.data.time);}
        if(event.data.type==="error"){busy=false;clearTimeout(timeout);reject(new Error(event.data.message));onError(event.data.message);}
      };
      worker.postMessage({type:"init",mode,base:location.origin});
    });
    if(generation!==this.generation)return;
    this.timer=setInterval(async()=>{
      if(!ready||busy||video.readyState<2||video.currentTime===lastTime)return;
      lastTime=video.currentTime;busy=true;const time=performance.now();
      try{const frame=await createImageBitmap(video);if(generation!==this.generation){frame.close();return;}worker.postMessage({type:"frame",frame,time},[frame]);}
      catch(error){busy=false;onError(error instanceof Error?error.message:"Camera frame unavailable");}
    },40);
    stream.getVideoTracks()[0]?.addEventListener("ended",()=>{if(generation===this.generation)onError("Camera disconnected. Stop and reconnect it.");});
  }
  stop(){this.generation++;if(this.timer)clearInterval(this.timer);this.timer=null;this.worker?.terminate();this.worker=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;if(this.video)this.video.srcObject=null;}
}
