import type { Calibration, PointerMode } from "./types";
import type { RawPoint } from "./math";

export const calibrationStages = ["center", "left", "right", "up", "down"] as const;
export type CalibrationStage = typeof calibrationStages[number];
export const calibrationStageMs = 3000;
export const calibrationDurationMs = calibrationStages.length * calibrationStageMs;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const noise = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * 0.95)];

/** Separate poses preserve which direction was measured and reject missing steps. */
export function calibrationFromPoses(poses: Record<CalibrationStage, RawPoint[]>, mode: PointerMode): Calibration {
  for (const stage of calibrationStages) if (poses[stage].length < 8)
    throw new Error(`The ${stage} capture did not have enough reliable frames. Keep in view and retry.`);
  const neutralX = median(poses.center.map(p => p.x)), neutralY = median(poses.center.map(p => p.y));
  const noiseX = noise(poses.center.map(p => Math.abs(p.x - neutralX)));
  const noiseY = noise(poses.center.map(p => Math.abs(p.y - neutralY)));
  const leftDelta = median(poses.left.map(p => p.x)) - neutralX;
  const rightDelta = median(poses.right.map(p => p.x)) - neutralX;
  const upDelta = median(poses.up.map(p => p.y)) - neutralY;
  const downDelta = median(poses.down.map(p => p.y)) - neutralY;
  const measurements = [
    ["left", Math.abs(leftDelta), noiseX],
    ["right", Math.abs(rightDelta), noiseX],
    ["up", Math.abs(upDelta), noiseY],
    ["down", Math.abs(downDelta), noiseY],
  ] as const;
  for (const [direction, amount, jitter] of measurements) {
    if (amount < 0.008 || amount <= jitter * 3)
      throw new Error(`The ${direction} pose was too close to center or unsteady. Use a small comfortable ${mode === "face" ? "head movement" : "palm movement"} in the shown direction and retry.`);
  }
  if (Math.sign(leftDelta) === Math.sign(rightDelta) || Math.sign(upDelta) === Math.sign(downDelta))
    throw new Error("The directional captures did not move consistently. Follow each direction prompt and retry.");
  const left = Math.abs(leftDelta), right = Math.abs(rightDelta);
  const up = Math.abs(upDelta), down = Math.abs(downDelta);
  // Store per-camera-side ranges. A mirrored preview/model path can reverse
  // either axis, so keep the intended movement direction separately.
  return {
    neutralX,
    neutralY,
    rangeX: (left + right) / 2,
    rangeY: (up + down) / 2,
    left: Math.max(left, noiseX * 12),
    right: Math.max(right, noiseX * 12),
    up: Math.max(up, noiseY * 12),
    down: Math.max(down, noiseY * 12),
    positiveX: Math.max(leftDelta > 0 ? left : right, noiseX * 12),
    negativeX: Math.max(leftDelta < 0 ? left : right, noiseX * 12),
    positiveY: Math.max(downDelta > 0 ? down : up, noiseY * 12),
    negativeY: Math.max(downDelta < 0 ? down : up, noiseY * 12),
    invertX: leftDelta < 0,
    invertY: downDelta < 0,
  };
}
