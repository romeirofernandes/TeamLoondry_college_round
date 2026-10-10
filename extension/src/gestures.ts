import type { GestureCalibration, GesturePreset, HandGesture } from "./shared";

export const gestureChoices: { id: HandGesture; label: string; hint: string }[] = [
  { id: "index", label: "One finger", hint: "Raise your index finger; curl the others." },
  { id: "two-fingers", label: "Two fingers", hint: "Raise your index and middle fingers." },
  { id: "three-fingers", label: "Three fingers", hint: "Raise your index, middle, and ring fingers." },
  { id: "fist", label: "Fist", hint: "Close your hand comfortably." },
  { id: "thumbs-up", label: "Thumbs-up", hint: "Raise your thumb with the other fingers curled." },
];

export const isHandGesture = (value: unknown): value is HandGesture =>
  gestureChoices.some((choice) => choice.id === value);

export function normalizeGesturePresets(value: unknown): GesturePreset[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  const seenGestures = new Set<HandGesture>();
  const presets: GesturePreset[] = [];
  for (const item of value.slice(0, 5)) {
    if (!item || typeof item !== "object") continue;
    const p = item as Partial<GesturePreset>;
    if (typeof p.id !== "string" || !/^[\w-]{1,80}$/.test(p.id) || seenIds.has(p.id)) continue;
    if (typeof p.name !== "string" || !p.name.trim() || p.name.length > 48) continue;
    if (!isHandGesture(p.gesture) || seenGestures.has(p.gesture)) continue;
    if (!p.calibration || !Number.isFinite(p.calibration.threshold) || p.calibration.threshold < 0.35 || p.calibration.threshold > 0.99 || !Number.isSafeInteger(p.calibration.calibratedAt)) continue;
    if (!p.action || typeof p.action !== "object") continue;
    const action = p.action;
    if (action.type === "open-site") {
      if (typeof action.destinationId !== "string" || action.destinationId.length > 200 || typeof action.url !== "string" || action.url.length > 3000 || typeof action.inNewTab !== "boolean") continue;
      try {
        const url = new URL(action.url);
        if (!(url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) || url.username || url.password) continue;
      } catch { continue; }
    } else if (!["media-toggle", "media-play", "media-pause", "back", "forward", "next-tab", "previous-tab", "scroll-top", "scroll-bottom"].includes(action.type)) continue;
    seenIds.add(p.id);
    seenGestures.add(p.gesture);
    presets.push({ ...p, id: p.id, name: p.name.trim(), gesture: p.gesture, action: action as GesturePreset["action"], calibration: p.calibration, enabled: p.enabled === true });
  }
  return presets;
}

export function classifyHandGesture(points: { x: number; y: number }[]): { gesture: HandGesture | null; confidence: number } {
  if (points.length < 21 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return { gesture: null, confidence: 0 };
  const wrist = points[0];
  const palmScale = Math.hypot(points[9].x - wrist.x, points[9].y - wrist.y);
  if (palmScale < 0.02) return { gesture: null, confidence: 0 };
  const pairs: [number, number, number][] = [[8, 6, 5], [12, 10, 9], [16, 14, 13], [20, 18, 17]];
  const ratios = pairs.map(([tip, pip]) => Math.hypot(points[tip].x - wrist.x, points[tip].y - wrist.y) / Math.hypot(points[pip].x - wrist.x, points[pip].y - wrist.y));
  const extended = ratios.map((ratio) => ratio > 1.12);
  const thumbUp = points[4].y < points[3].y - palmScale * 0.12 && Math.hypot(points[4].x - points[2].x, points[4].y - points[2].y) > palmScale * 0.38;
  const confidenceFor = (expected: boolean[]) => {
    const scores = ratios.map((ratio, index) => expected[index] ? Math.min(1, Math.max(0, (ratio - 1.02) / 0.34)) : Math.min(1, Math.max(0, (1.24 - ratio) / 0.30)));
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  };
  const patterns: [HandGesture, boolean[]][] = [
    ["index", [true, false, false, false]],
    ["two-fingers", [true, true, false, false]],
    ["three-fingers", [true, true, true, false]],
    ["fist", [false, false, false, false]],
  ];
  let best: { gesture: HandGesture; confidence: number } | null = null;
  for (const [gesture, expected] of patterns) {
    if (extended.some((value, index) => value !== expected[index])) continue;
    const confidence = confidenceFor(expected);
    if (!best || confidence > best.confidence) best = { gesture, confidence };
  }
  if (!extended.some(Boolean) && thumbUp) {
    const confidence = Math.min(confidenceFor([false, false, false, false]), 0.55 + Math.min(0.45, Math.abs(points[4].y - points[3].y) / palmScale));
    if (!best || confidence > best.confidence) best = { gesture: "thumbs-up", confidence };
  }
  return best ? { gesture: best.gesture, confidence: Math.max(0, Math.min(1, best.confidence)) } : { gesture: null, confidence: 0 };
}

export const defaultGestureCalibration = (): GestureCalibration => ({ threshold: 0.62, calibratedAt: Date.now() });
