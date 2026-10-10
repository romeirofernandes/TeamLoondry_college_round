import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { classifyHandGesture } from "./gestures";

let model: HandLandmarker | null = null;
let epoch = 0;
self.onmessage = async (event: MessageEvent) => {
  const message = event.data;
  if (message.type === "init") {
    const current = ++epoch;
    try {
      const files = await FilesetResolver.forVisionTasks(message.baseURL + "assets/wasm");
      const created = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: message.baseURL + "assets/models/hand_landmarker.task", delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.65,
        minHandPresenceConfidence: 0.65,
        minTrackingConfidence: 0.65,
      });
      if (current !== epoch) { created.close(); return; }
      model = created;
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  } else if (message.type === "frame") {
    const bitmap = message.bitmap as ImageBitmap;
    try {
      if (!model) throw new Error("Gesture model is not ready");
      const result = model.detectForVideo(bitmap, message.timestamp);
      const points = result.landmarks[0]?.map(point => ({ x: point.x, y: point.y })) || [];
      const classified = classifyHandGesture(points);
      self.postMessage({ type: "pose", ...classified, timestamp: message.timestamp });
    } catch (error) {
      self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
    } finally { bitmap.close(); }
  } else if (message.type === "close") {
    epoch++;
    model?.close();
    model = null;
    self.close();
  }
};
