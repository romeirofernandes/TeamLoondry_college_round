import { createInference, type Inference } from "./inference";
import type { PointerMode } from "../shared";
let model: Inference | null = null;
let generation = 0;
self.onmessage = async (event: MessageEvent) => {
  const data = event.data;
  if (data.type === "init") {
    const token = ++generation;
    model?.close();
    model = null;
    try {
      const created = await createInference(
        data.baseURL,
        data.mode as PointerMode,
      );
      if (token !== generation) {
        created.close();
        return;
      }
      model = created;
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } else if (data.type === "frame") {
    const bitmap = data.bitmap as ImageBitmap;
    try {
      if (!model) throw new Error("Tracking model is not ready");
      const start = performance.now();
      const point = model.detect(bitmap, data.timestamp);
      self.postMessage({
        type: "sample",
        point,
        timestamp: data.timestamp,
        epoch: data.epoch,
        latencyMs: performance.now() - start,
      });
    } catch (error) {
      self.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      bitmap.close();
    }
  } else if (data.type === "close") {
    generation++;
    model?.close();
    model = null;
    self.close();
  }
};
