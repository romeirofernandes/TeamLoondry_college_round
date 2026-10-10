import { describe, it, expect } from "vitest";
import { PointerFilter, landmarkPoint } from "../src/tracking/math";
import { defaults } from "../src/shared";
import { ActivationGate } from "../src/core/safety";

describe("tracking cursor contract", () => {
  it("maps neutral to center, range to screen edge and mirrors horizontal movement", () => {
    const f = new PointerFilter();
    f.setCalibration({
      neutralX: 0.5,
      neutralY: 0.5,
      rangeX: 0.2,
      rangeY: 0.2,
    });
    expect(
      f.update({ x: 0.5, y: 0.5, confidence: 1 }, 0, defaults),
    ).toMatchObject({ x: 0.5, y: 0.5, handHold: false });
    const edge = new PointerFilter();
    edge.setCalibration({
      neutralX: 0.5,
      neutralY: 0.5,
      rangeX: 0.2,
      rangeY: 0.2,
    });
    const point = edge.update({ x: 0.3, y: 0.7, confidence: 1 }, 0, defaults);
    expect(point.x).toBeCloseTo(1);
    expect(point.y).toBeCloseTo(1);
  });
  it("freezes and cancels hand hold when confidence is lost", () => {
    const f = new PointerFilter();
    const a = f.update({ x: 0.6, y: 0.5, confidence: 1 }, 0, defaults);
    expect(f.update(null, 50, defaults)).toMatchObject({
      x: a.x,
      y: a.y,
      confidence: 0,
      handHold: false,
    });
    expect(
      f.update({ x: 0.1, y: 0.1, confidence: 0.2 }, 100, defaults),
    ).toMatchObject({ x: a.x, y: a.y, handHold: false });
  });
  it("requires a stationary broad hand for hold and cancels on movement", () => {
    const f = new PointerFilter();
    const settings = { ...defaults, pointerMode: "hand" as const };
    expect(
      f.update({ x: 0.5, y: 0.5, confidence: 1 }, 0, settings).handHold,
    ).toBe(false);
    expect(
      f.update({ x: 0.5, y: 0.5, confidence: 1 }, 33, settings).handHold,
    ).toBe(true);
    expect(
      f.update({ x: 0.7, y: 0.5, confidence: 1 }, 900, settings).handHold,
    ).toBe(false);
    expect(
      f.update({ x: 0.7, y: 0.5, confidence: 1 }, 933, settings).handHold,
    ).toBe(true);
    expect(f.update(null, 966, settings).handHold).toBe(false);
    expect(
      f.update({ x: 0.7, y: 0.5, confidence: 1 }, 999, settings).handHold,
    ).toBe(false);
    expect(
      f.update({ x: 0.7, y: 0.5, confidence: 1 }, 1032, settings).handHold,
    ).toBe(true);
  });
  it("uses one safety timer for broad-hand selection and latches the activation", () => {
    const filter = new PointerFilter(),
      gate = new ActivationGate({ dwellMs: 800 });
    const settings = {
      ...defaults,
      pointerMode: "hand" as const,
      dwellEnabled: false,
    };
    filter.update({ x: 0.5, y: 0.5, confidence: 1 }, -33, settings);
    const update = (now: number) => {
      const sample = filter.update(
        { x: 0.5, y: 0.5, confidence: 1 },
        now,
        settings,
      );
      return gate.update({
        targetId: "button",
        confidence: sample.confidence,
        paused: false,
        tracking: true,
        now,
        dwellEnabled: false,
        handHold: sample.handHold,
        activate: sample.handHold ? "hand" : "dwell",
      });
    };
    expect(update(0)).toMatchObject({ activate: false, progress: 0 });
    expect(update(400)).toMatchObject({ activate: false, progress: 0.5 });
    expect(update(799).activate).toBe(false);
    expect(update(800)).toMatchObject({ activate: true, progress: 1 });
    expect(update(1600)).toMatchObject({ activate: false, reason: "latched" });
  });
  it("does not call face geometry a model confidence score", () => {
    const points = Array.from({ length: 478 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
    }));
    points[33] = { x: 0.35, y: 0.4, z: 0 };
    points[263] = { x: 0.65, y: 0.4, z: 0 };
    points[1] = { x: 0.5, y: 0.5, z: 0 };
    const p = landmarkPoint(points, "face");
    expect(p?.confidence).toBeGreaterThan(0.7);
    expect(landmarkPoint([], "face")).toBeNull();
    points[1].x = NaN;
    expect(landmarkPoint(points, "face")).toBeNull();
  });
});
