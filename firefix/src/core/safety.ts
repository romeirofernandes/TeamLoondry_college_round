export interface GateConfig {
  dwellMs: number;
  confidenceThreshold: number;
}
export interface GateSample {
  targetId: string | null;
  confidence: number;
  paused: boolean;
  tracking: boolean;
  now: number;
  activate?: "dwell" | "voice" | "hand";
  dwellEnabled?: boolean;
  handHold?: boolean;
}
export type GateReason =
  | "waiting"
  | "activated"
  | "latched"
  | "paused"
  | "tracking-loss"
  | "low-confidence"
  | "no-target"
  | "disabled"
  | "invalid";
export interface GateResult {
  activate: boolean;
  progress: number;
  reason: GateReason;
}

/** Every pointer-driven activation passes through this gate, including voice and hand. */
export class ActivationGate {
  private config: GateConfig;
  private targetId: string | null = null;
  private enteredAt: number | null = null;
  private handSince: number | null = null;
  private latched = false;
  private lastAt: number | null = null;

  constructor(config: Partial<GateConfig> = {}) {
    this.config = { dwellMs: 800, confidenceThreshold: 0.7 };
    this.configure(config);
  }

  configure(config: Partial<GateConfig>): void {
    if (config.dwellMs !== undefined && Number.isFinite(config.dwellMs))
      this.config.dwellMs = Math.max(250, Math.min(5000, config.dwellMs));
    if (
      config.confidenceThreshold !== undefined &&
      Number.isFinite(config.confidenceThreshold)
    )
      this.config.confidenceThreshold = Math.max(
        0,
        Math.min(1, config.confidenceThreshold),
      );
    this.enteredAt = null;
    this.handSince = null;
  }

  reset(): void {
    this.targetId = null;
    this.enteredAt = null;
    this.handSince = null;
    this.latched = false;
    this.lastAt = null;
  }

  update(sample: GateSample): GateResult {
    const blocked = (reason: GateReason): GateResult => {
      this.enteredAt = null;
      this.handSince = null;
      return { activate: false, progress: 0, reason };
    };
    if (
      !Number.isFinite(sample.now) ||
      !Number.isFinite(sample.confidence) ||
      (this.lastAt !== null && sample.now < this.lastAt)
    )
      return blocked("invalid");
    this.lastAt = sample.now;
    if (sample.paused) return blocked("paused");
    if (!sample.tracking) return blocked("tracking-loss");
    if (sample.confidence < this.config.confidenceThreshold)
      return blocked("low-confidence");
    // Unsafe loss must not count as leaving the target and release an activation latch.
    if (!sample.targetId) {
      this.targetId = null;
      this.latched = false;
      return blocked("no-target");
    }
    if (sample.targetId !== this.targetId) {
      this.targetId = sample.targetId;
      this.enteredAt = sample.now;
      this.handSince = null;
      this.latched = false;
    }
    if (this.latched)
      return { activate: false, progress: 1, reason: "latched" };
    if (this.enteredAt === null) this.enteredAt = sample.now;
    const hand = sample.activate === "hand" || sample.handHold === true;
    if (hand && this.handSince === null) this.handSince = sample.now;
    if (!hand) this.handSince = null;

    if (sample.activate !== "voice" && !hand && sample.dwellEnabled === false)
      return { activate: false, progress: 0, reason: "disabled" };
    const elapsed = sample.now - (hand ? this.handSince! : this.enteredAt);
    const progress = Math.max(0, Math.min(1, elapsed / this.config.dwellMs));
    if (sample.activate === "voice" || progress >= 1) {
      this.latched = true;
      return { activate: true, progress: 1, reason: "activated" };
    }
    return { activate: false, progress, reason: "waiting" };
  }
}
