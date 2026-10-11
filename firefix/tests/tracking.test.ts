import { describe, it, expect } from "vitest";
import { PointerFilter, landmarkPoint } from "../src/tracking/math";
import { defaults } from "../src/shared";
import { ActivationGate } from "../src/core/safety";
import { calibrationFromPoses } from "../src/tracking/calibration";
import {PointerFilter as sharedFilter} from "../shared/tracking/math";
import {calibrationFromPoses as sharedCalibration} from "../shared/tracking/calibration";

it("uses the same tracking implementation as the desktop app",()=>{
  expect(PointerFilter).toBe(sharedFilter);
  expect(calibrationFromPoses).toBe(sharedCalibration);
});

it("maps five small hand captures independently and rejects a missing direction", () => {
  const points = (x: number, y: number) => Array.from({ length: 12 }, () => ({ x, y, confidence: 1 }));
  const poses = { center: points(0.5, 0.5), left: points(0.512, 0.5), right: points(0.482, 0.5), up: points(0.5, 0.49), down: points(0.5, 0.516) };
  const calibration = calibrationFromPoses(poses, "hand");
  expect(calibration.left).toBeCloseTo(0.012);
  expect(calibration.right).toBeCloseTo(0.018);
  expect(calibration.up).toBeCloseTo(0.01);
  const filter = new PointerFilter(); filter.setCalibration(calibration);
  const position = filter.update({ x: 0.508, y: 0.5, confidence: 1 }, 0, { ...defaults, pointerMode: "hand" });
  expect(position.x).toBe(0);
  expect(() => calibrationFromPoses({ ...poses, right: poses.center }, "hand")).toThrow("right");
});

describe("tracking cursor contract", () => {
  it("keeps hand mapping absolute, with neutral at center and mirrored range at the edge", () => {
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
    const point = edge.update({ x: 0.3, y: 0.7, confidence: 1 }, 0, { ...defaults, pointerMode: "hand" });
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

describe("comfortable face rate control", () => {
  const turn = { x: 0.48, y: 0.5, confidence: 1 };
  const neutral = { x: 0.5, y: 0.5, confidence: 1 };
  const filter = () => {
    const f = new PointerFilter();
    f.setCalibration({ neutralX: 0.5, neutralY: 0.5, rangeX: 0.04, rangeY: 0.04 });
    return f;
  };
  it("continues moving for a held small turn and stops at neutral without recentering", () => {
    const f = filter();
    f.update(turn, 0, defaults);
    const first = f.update(turn, 100 / 3, defaults);
    const later = f.update(turn, 200 / 3, defaults);
    expect(later.x).toBeGreaterThan(first.x);
    const stopped = f.update(neutral, 100, defaults);
    expect(stopped.x).toBe(later.x);
    expect(f.update(neutral, 200, defaults).x).toBe(later.x);
    expect(later.x).toBeGreaterThan(0.5);
  });
  it("ignores small neutral landmark noise instead of accumulating drift", () => {
    const f = filter();
    f.update(neutral, 0, defaults);
    for (let t = 33; t < 1000; t += 33) {
      const result = f.update({ x: 0.503, y: 0.497, confidence: 1 }, t, defaults);
      expect(result).toMatchObject({ x: 0.5, y: 0.5 });
    }
  });
  it("integrates elapsed time consistently across camera frame rates", () => {
    const travel = (step: number) => {
      const f = filter();
      f.update(turn, 0, defaults);
      for (let t = step; t <= 500; t += step) f.update(turn, t, defaults);
      return f.update(turn, 500, defaults).x;
    };
    expect(travel(10)).toBeCloseTo(travel(50), 5);
  });
  it("freezes on loss, skips elapsed loss/pause time and bounds delayed frames", () => {
    const f = filter();
    f.update(turn, 0, defaults);
    const before = f.update(turn, 33, defaults);
    expect(f.update(null, 66, defaults).x).toBe(before.x);
    expect(f.update(turn, 10000, defaults).x).toBe(before.x);
    const resumed = f.update(turn, 10033, defaults);
    expect(resumed.x).toBeGreaterThan(before.x);
    f.reset();
    expect(f.update(turn, 20000, defaults).x).toBe(resumed.x);
    expect(f.update(turn, 30000, defaults).x - resumed.x).toBeLessThan(0.04);
  });
});
