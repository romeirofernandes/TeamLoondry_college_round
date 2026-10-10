import type { Calibration, PointerMode, Settings } from "../shared";

export interface RawPoint {
  x: number;
  y: number;
  confidence: number;
}
export interface Landmark {
  x: number;
  y: number;
  z?: number;
}
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);

/** MediaPipe's face result has no exported face probability. This is a geometric
 * quality proxy, not a model confidence: valid in-frame landmarks, useful scale,
 * and non-degenerate geometry. Detection/presence/tracking thresholds are set on
 * the model itself. Hand quality is additionally capped by handedness score. */
export function landmarkPoint(
  points: Landmark[],
  mode: PointerMode,
  handednessScore = 1,
): RawPoint | null {
  const required = mode === "face" ? [1, 33, 263] : [0, 5, 9, 13, 17];
  if (
    required.some(
      (i) =>
        !points[i] ||
        !Number.isFinite(points[i].x) ||
        !Number.isFinite(points[i].y),
    )
  )
    return null;
  const inFrame = required.every(
    (i) =>
      points[i].x > 0.015 &&
      points[i].x < 0.985 &&
      points[i].y > 0.015 &&
      points[i].y < 0.985,
  );
  const size =
    mode === "face"
      ? distance(points[33], points[263])
      : distance(points[0], points[9]);
  if (size < 0.035 || size > 0.65) return null;
  const quality = Math.min(
    inFrame ? 1 : 0.35,
    clamp((size - 0.035) / 0.065),
    mode === "hand" ? clamp(handednessScore) : 1,
  );
  if (mode === "hand")
    return {
      x: required.reduce((sum, i) => sum + points[i].x, 0) / required.length,
      y: required.reduce((sum, i) => sum + points[i].y, 0) / required.length,
      confidence: quality,
    };
  const centerX = (points[33].x + points[263].x) / 2;
  const centerY = (points[33].y + points[263].y) / 2;
  // Translation follows the nose; relative displacement adds head-turn response.
  return {
    x: points[1].x + ((points[1].x - centerX) / size) * 0.12,
    y: points[1].y + ((points[1].y - centerY) / size) * 0.04,
    confidence: quality,
  };
}

class OneEuro {
  private value: number | undefined;
  private raw = 0;
  private derivative = 0;
  private last = 0;
  reset() {
    this.value = undefined;
    this.derivative = 0;
  }
  update(value: number, time: number) {
    if (this.value === undefined) {
      this.raw = value;
      this.value = value;
      this.last = time;
      return value;
    }
    const dt = clamp((time - this.last) / 1000, 0.001, 0.2);
    this.last = time;
    const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    const change = (value - this.raw) / dt;
    this.raw = value;
    this.derivative += alpha(1) * (change - this.derivative);
    this.value +=
      alpha(1.6 + 0.4 * Math.abs(this.derivative)) * (value - this.value);
    return this.value;
  }
}

export class PointerFilter {
  private calibration: Calibration = {
    neutralX: 0.5,
    neutralY: 0.5,
    rangeX: 0.18,
    rangeY: 0.14,
  };
  private horizontal = new OneEuro();
  private vertical = new OneEuro();
  private current = { x: 0.5, y: 0.5 };
  private lastRaw: RawPoint | null = null;
  private holdAnchor: RawPoint | null = null;
  private driftSince = 0;
  private lastTime: number | null = null;
  setCalibration(calibration: Calibration) {
    this.calibration = { ...calibration };
    this.reset();
  }
  reset() {
    this.horizontal.reset();
    this.vertical.reset();
    this.lastRaw = null;
    this.holdAnchor = null;
    this.driftSince = 0;
    this.lastTime = null;
  }
  update(raw: RawPoint | null, time: number, settings: Settings) {
    const dt = this.lastTime === null ? 0 : clamp(time - this.lastTime, 0, 100);
    this.lastTime = time;
    if (!raw || raw.confidence < settings.confidenceThreshold) {
      this.reset();
      return {
        ...this.current,
        confidence: raw?.confidence ?? 0,
        handHold: false,
      };
    }
    // A discontinuous point cannot be used to activate. Treat it as tracking loss
    // for this frame, then allow the filters to reacquire on the next valid frame.
    if (
      this.lastRaw &&
      Math.hypot(raw.x - this.lastRaw.x, raw.y - this.lastRaw.y) > 0.22
    ) {
      this.reset();
      return { ...this.current, confidence: 0, handHold: false };
    }
    this.lastRaw = raw;
    const c = this.calibration;
    let dx = (raw.x - c.neutralX) / c.rangeX,
      dy = (raw.y - c.neutralY) / c.rangeY;
    // Face rate control needs a quiet neutral band: small landmark noise must
    // not accumulate travel indefinitely. Hand pointing keeps its original band.
    const deadZone = settings.pointerMode === "face" ? Math.max(0.12, settings.deadZone) : settings.deadZone;
    const dead = (n: number) =>
      Math.abs(n) <= deadZone
        ? 0
        : (Math.sign(n) * (Math.abs(n) - deadZone)) /
          (1 - deadZone);
    const still = Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15;
    if (still) {
      if (!this.driftSince) this.driftSince = time;
      if (time - this.driftSince > 2500) {
        const rate = (dt / 1000) * 0.015;
        c.neutralX += (raw.x - c.neutralX) * rate;
        c.neutralY += (raw.y - c.neutralY) * rate;
      }
    } else this.driftSince = 0;
    if (settings.pointerMode === "face") {
      // Filter direction/speed, then integrate: held turns keep moving and neutral
      // stops at the current position. Timing is cleared on loss/pause.
      const velocity = (offset: number, axis: OneEuro) => {
        const desired = dead(clamp(offset, -1, 1));
        if (desired === 0) { axis.reset(); return 0; }
        return axis.update(desired, time);
      };
      const speed = 0.65 * settings.sensitivity * dt / 1000;
      this.current = {
        x: clamp(this.current.x - velocity(dx, this.horizontal) * speed),
        y: clamp(this.current.y + velocity(dy, this.vertical) * speed),
      };
    } else this.current = {
      x: clamp(
        this.horizontal.update(
          0.5 - dead(dx) * settings.sensitivity * 0.5,
          time,
        ),
      ),
      y: clamp(
        this.vertical.update(0.5 + dead(dy) * settings.sensitivity * 0.5, time),
      ),
    };
    let handHold = false;
    if (settings.pointerMode === "hand") {
      if (
        !this.holdAnchor ||
        Math.hypot(raw.x - this.holdAnchor.x, raw.y - this.holdAnchor.y) > 0.018
      ) {
        this.holdAnchor = { ...raw };
      } else handHold = true;
      // This reports steadiness only. ActivationGate owns the single dwell/hold
      // timer, so pointing never adds a second wait before the visible ring.
    } else this.holdAnchor = null;
    return { ...this.current, confidence: raw.confidence, handHold };
  }
}
