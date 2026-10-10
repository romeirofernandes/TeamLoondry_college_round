import {
  FaceLandmarker,
  HandLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import type { PointerMode } from "./types";
import { landmarkPoint, type RawPoint } from "./math";

export interface Inference {
  detect(image: HTMLVideoElement | ImageBitmap, time: number): RawPoint | null;
  close(): void;
}
export async function createInference(
  baseURL: string,
  mode: PointerMode,
): Promise<Inference> {
  const assets = await FilesetResolver.forVisionTasks(baseURL + "assets/wasm");
  const options = {
    baseOptions: {
      modelAssetPath:
        baseURL +
        `assets/models/${mode === "face" ? "face" : "hand"}_landmarker.task`,
      delegate: "CPU" as const,
    },
    runningMode: "VIDEO" as const,
  };
  if (mode === "face") {
    const model = await FaceLandmarker.createFromOptions(assets, {
      ...options,
      numFaces: 1,
      minFaceDetectionConfidence: 0.7,
      minFacePresenceConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });
    return {
      detect(image, time) {
        const result = model.detectForVideo(image, time);
        return landmarkPoint(result.faceLandmarks[0] ?? [], "face");
      },
      close() {
        model.close();
      },
    };
  }
  const model = await HandLandmarker.createFromOptions(assets, {
    ...options,
    numHands: 1,
    minHandDetectionConfidence: 0.7,
    minHandPresenceConfidence: 0.7,
    minTrackingConfidence: 0.7,
  });
  return {
    detect(image, time) {
      const result = model.detectForVideo(image, time);
      return landmarkPoint(
        result.landmarks[0] ?? [],
        "hand",
        result.handedness[0]?.[0]?.score ?? 0,
      );
    },
    close() {
      model.close();
    },
  };
}
