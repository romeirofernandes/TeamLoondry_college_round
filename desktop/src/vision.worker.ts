import { FaceLandmarker, HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { landmarkPoint } from "./math";
import type { PointerMode } from "./types";
let model:FaceLandmarker|HandLandmarker|null=null;
let mode:PointerMode="face";
self.onmessage=async(event:MessageEvent)=>{
  const message=event.data;
  try{
    if(message.type==="init"){
      mode=message.mode;
      const assets=await FilesetResolver.forVisionTasks(`${message.base}/assets/wasm`);
      const baseOptions={modelAssetPath:`${message.base}/assets/models/${mode}_landmarker.task`,delegate:"CPU" as const};
      model=mode==="face"?await FaceLandmarker.createFromOptions(assets,{baseOptions,runningMode:"VIDEO",numFaces:1,minFaceDetectionConfidence:0.7,minFacePresenceConfidence:0.7,minTrackingConfidence:0.7}):await HandLandmarker.createFromOptions(assets,{baseOptions,runningMode:"VIDEO",numHands:1,minHandDetectionConfidence:0.7,minHandPresenceConfidence:0.7,minTrackingConfidence:0.7});
      self.postMessage({type:"ready"});
    }else if(message.type==="frame"&&model){
      const frame=message.frame as ImageBitmap;
      try{
        let point;
        if(mode==="face"){const result=(model as FaceLandmarker).detectForVideo(frame,message.time);point=landmarkPoint(result.faceLandmarks[0]??[],mode);}
        else {const result=(model as HandLandmarker).detectForVideo(frame,message.time);point=landmarkPoint(result.landmarks[0]??[],mode,result.handedness[0]?.[0]?.score??0);}
        self.postMessage({type:"point",point,time:message.time});
      }finally{frame.close();}
    }
  }catch(error){self.postMessage({type:"error",message:error instanceof Error?error.message:String(error)});}
};
