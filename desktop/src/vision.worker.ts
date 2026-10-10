import { createInference, type Inference } from "../../shared/tracking/inference";
let model: Inference | null = null;
self.onmessage = async (event: MessageEvent) => {
  const m = event.data;
  try {
    if (m.type === "init") {
      model?.close();
      model = await createInference(m.base + "/", m.mode);
      self.postMessage({type:"ready"});
    } else if (m.type === "frame" && model) {
      try { self.postMessage({type:"point",point:model.detect(m.frame,m.time),time:m.time}); }
      finally { m.frame.close(); }
    }
  } catch (error) { self.postMessage({type:"error",message:String(error)}); }
};
