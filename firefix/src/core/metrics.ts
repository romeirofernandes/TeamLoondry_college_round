import type { MetricEvent } from "../shared";

export const MAX_METRIC_EVENTS = 500;

/** Bounded, oldest-first local log. Callers must use labels, never dictated text or keys. */
export function appendMetric(
  events: MetricEvent[],
  event: MetricEvent,
  limit = MAX_METRIC_EVENTS,
): MetricEvent[] {
  const capacity = Number.isFinite(limit)
    ? Math.max(1, Math.min(MAX_METRIC_EVENTS, Math.floor(limit)))
    : MAX_METRIC_EVENTS;
  if (!Number.isFinite(event.at) || !event.type.trim())
    return events.slice(-capacity);
  const safe: MetricEvent = {
    at: event.at,
    type: event.type.trim().slice(0, 80),
  };
  if (event.detail !== undefined) safe.detail = event.detail.slice(0, 200);
  if (event.value !== undefined && Number.isFinite(event.value))
    safe.value = event.value;
  return [...events, safe].slice(-capacity);
}

export interface MetricSummary {
  runCount: number;
  durationMs: number;
  recognizedCommands: number;
  unknownCommands: number;
  activations: number;
  trackingLosses: number;
  averageFps: number | null;
  averageLatencyMs: number | null;
  completedTasks: number;
  taskCompletionMs: number;
  selectionErrors: number;
  accidentalActivations: number;
}

export function summarizeMetrics(events: MetricEvent[]): MetricSummary {
  const summary: MetricSummary = {
    runCount: 0,
    durationMs: 0,
    recognizedCommands: 0,
    unknownCommands: 0,
    activations: 0,
    trackingLosses: 0,
    averageFps: null,
    averageLatencyMs: null,
    completedTasks: 0,
    taskCompletionMs: 0,
    selectionErrors: 0,
    accidentalActivations: 0,
  };
  let runStart: number | null = null;
  let taskStart: number | null = null;
  const fps: number[] = [];
  const latency: number[] = [];
  for (const event of events) {
    if (!Number.isFinite(event.at)) continue;
    if (event.type === "run-start") {
      summary.runCount++;
      runStart = event.at;
    }
    if (event.type === "run-stop" && runStart !== null) {
      summary.durationMs += Math.max(0, event.at - runStart);
      runStart = null;
    }
    if (event.type === "command-recognized") summary.recognizedCommands++;
    if (event.type === "command-unknown") summary.unknownCommands++;
    if (event.type === "activation") summary.activations++;
    if (event.type === "tracking-loss") summary.trackingLosses++;
    if (event.type === "task-start") taskStart = event.at;
    if (event.type === "task-complete" && taskStart !== null) {
      if (event.at >= taskStart) {
        summary.completedTasks++;
        summary.taskCompletionMs += event.at - taskStart;
      }
      taskStart = null;
    }
    if (event.type === "selection-error") summary.selectionErrors++;
    if (event.type === "accidental-activation") summary.accidentalActivations++;
    if (
      event.value !== undefined &&
      Number.isFinite(event.value) &&
      event.value >= 0
    ) {
      if (event.type === "fps") fps.push(event.value);
      if (event.type === "latency") latency.push(event.value);
    }
  }
  const average = (values: number[]): number | null =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  summary.averageFps = average(fps);
  summary.averageLatencyMs = average(latency);
  return summary;
}
