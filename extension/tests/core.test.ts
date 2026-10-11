import { describe, expect, it } from "vitest";
import { normalizeSpeech, parseIntent, wakeRequest } from "../src/core/parser";
import { ActivationGate } from "../src/core/safety";
import { adjacentTabId, rankTabs, rankTargets } from "../src/core/ranking";
import { appendMetric, summarizeMetrics } from "../src/core/metrics";

describe("explicit arbitrary request prefix", () => {
  it.each(["hey handsfree summarize this page", "Hey, Hands Free: summarize this page", "hey hands-free summarize this page"])("accepts the prefix at the start of %s", text => {
    expect(wakeRequest(text)).toBe("summarize this page");
  });
  it.each(["summarize this page", "hello handsfree summarize this page", "okay handsfree summarize this page", "ok handsfree summarize this page", "please hey handsfree summarize this page", "I said hey handsfree summarize this page", "handsfree hey handsfree summarize this page"])("rejects %s as arbitrary authorization", text => {
    expect(wakeRequest(text)).toBeNull();
  });
});

describe("fixed speech and explicit query commands", () => {
  it.each([
    [" Scroll DOWN! ", { type: "scroll", direction: "down" }],
    ["go back", { type: "back" }],
    ["previous page", { type: "back" }],
    ["go forward", { type: "forward" }],
    ["click this", { type: "click" }],
    ["open this", { type: "open" }],
    ["start typing", { type: "start-typing" }],
    ["stop typing", { type: "stop-typing" }],
    ["confirm", { type: "confirm" }],
    ["cancel", { type: "cancel" }],
    ["submit form", { type: "submit" }],
    ["pause handsfree", { type: "pause" }],
    ["resume handsfree", { type: "resume" }],
    ["stop handsfree", { type: "stop" }],
    ["new tab", { type: "new-tab" }],
    ["next tab", { type: "next-tab" }],
    ["previous tab", { type: "previous-tab" }],
    ["close tab", { type: "close-tab" }],
    ["close this tab", { type: "close-tab" }],
    ["show tabs", { type: "show-tabs" }],
    ["go to tab 3", { type: "indexed-tab", index: 3 }],
    ["go to tab three", { type: "indexed-tab", index: 3 }],
    ["go to tab 12", { type: "indexed-tab", index: 12 }],
    ["switch to the third tab", { type: "indexed-tab", index: 3 }],
    ["switch to the twelfth tab", { type: "indexed-tab", index: 12 }],
    ["go to first tab", { type: "indexed-tab", index: 1 }],
    ["open incognito", { type: "incognito" }],
    ["open history", { type: "history" }],
    ["open downloads", { type: "downloads" }],
    ["open settings", { type: "settings" }],
    ["go to tab project notes", { type: "named-tab", name: "project notes" }],
    ["find careers page", { type: "find", query: "careers page" }],
    [
      "background search for motor support",
      { type: "search", query: "motor support", background: true },
    ],
    [
      "search for gardening",
      { type: "search", query: "gardening", background: false },
    ],
    ["choose two", { type: "choose", index: 2 }],
  ])("parses %s deterministically", (phrase, intent) => {
    expect(parseIntent(phrase)).toEqual(intent);
  });

  it("never treats text containing command words as a command", () => {
    for (const phrase of [
      "please click this eventually",
      "I said stop typing yesterday",
      "close tab project",
      "find",
      "search for",
    ]) {
      expect(parseIntent(phrase)).toEqual({ type: "unknown", heard: phrase });
    }
  });

  it("normalizes Unicode spaces while retaining the original unknown phrase", () => {
    expect(normalizeSpeech("  START\u00a0 TYPING. ")).toBe("start typing");
    expect(parseIntent("  What was that? ")).toEqual({
      type: "unknown",
      heard: "What was that?",
    });
  });
});

describe("activation safety", () => {
  const sample = {
    targetId: "link",
    confidence: 0.9,
    paused: false,
    tracking: true,
    now: 0,
  };

  it("waits for the whole dwell, then activates once until the pointer leaves", () => {
    const gate = new ActivationGate({ dwellMs: 800, confidenceThreshold: 0.7 });
    expect(gate.update(sample)).toMatchObject({ activate: false, progress: 0 });
    expect(gate.update({ ...sample, now: 799 })).toMatchObject({
      activate: false,
    });
    expect(gate.update({ ...sample, now: 800 })).toMatchObject({
      activate: true,
      progress: 1,
    });
    expect(gate.update({ ...sample, now: 1700 })).toMatchObject({
      activate: false,
      reason: "latched",
    });
    gate.update({ ...sample, targetId: null, now: 1800 });
    gate.update({ ...sample, now: 2000 });
    expect(gate.update({ ...sample, now: 2800 }).activate).toBe(true);
  });

  it.each([{ paused: true }, { tracking: false }, { confidence: 0.2 }])(
    "cancels dwell on %j",
    (unsafe) => {
      const gate = new ActivationGate();
      gate.update(sample);
      gate.update({ ...sample, now: 700, ...unsafe });
      expect(gate.update({ ...sample, now: 1000 }).progress).toBe(0);
      expect(gate.update({ ...sample, now: 1799 }).activate).toBe(false);
      expect(gate.update({ ...sample, now: 1800 }).activate).toBe(true);
    },
  );

  it("restarts dwell when a new target is snapped", () => {
    const gate = new ActivationGate();
    gate.update(sample);
    expect(
      gate.update({ ...sample, targetId: "other", now: 800 }).activate,
    ).toBe(false);
    expect(
      gate.update({ ...sample, targetId: "other", now: 1600 }).activate,
    ).toBe(true);
  });

  it("blocks voice and hand actions on low confidence and requires a sustained hand hold", () => {
    const gate = new ActivationGate();
    expect(
      gate.update({ ...sample, confidence: 0.1, activate: "voice" }).activate,
    ).toBe(false);
    gate.update({ ...sample, now: 20, activate: "hand" });
    expect(
      gate.update({ ...sample, now: 700, activate: "hand" }).activate,
    ).toBe(false);
    gate.update({ ...sample, now: 750, dwellEnabled: false, handHold: false });
    gate.update({ ...sample, now: 800, activate: "hand" });
    expect(
      gate.update({ ...sample, now: 1599, activate: "hand" }).activate,
    ).toBe(false);
    expect(
      gate.update({ ...sample, now: 1600, activate: "hand" }).activate,
    ).toBe(true);
  });

  it("allows intentional voice confirmation even when automatic dwell is disabled", () => {
    const gate = new ActivationGate();
    expect(
      gate.update({ ...sample, now: 1000, dwellEnabled: false }).activate,
    ).toBe(false);
    expect(
      gate.update({
        ...sample,
        now: 1001,
        dwellEnabled: false,
        activate: "voice",
      }).activate,
    ).toBe(true);
  });

  it("keeps activated targets latched through loss and pause", () => {
    const gate = new ActivationGate();
    gate.update({ ...sample, activate: "voice" });
    gate.update({ ...sample, targetId: null, tracking: false, now: 100 });
    gate.update({ ...sample, paused: true, now: 200 });
    expect(
      gate.update({ ...sample, activate: "voice", now: 400 }).activate,
    ).toBe(false);
  });

  it("fails closed on invalid confidence or timestamps and clock reversal", () => {
    const gate = new ActivationGate();
    gate.update({ ...sample, now: 1000 });
    expect(gate.update({ ...sample, now: 999 }).activate).toBe(false);
    expect(
      gate.update({ ...sample, confidence: NaN, now: 2000, activate: "voice" })
        .activate,
    ).toBe(false);
    expect(
      gate.update({ ...sample, now: Infinity, activate: "voice" }).activate,
    ).toBe(false);
  });
});

describe("target and tab ranking", () => {
  const targets = [
    { id: "careers", text: "Careers", role: "link" },
    { id: "support", text: "Get support", role: "button" },
    { id: "people", text: "Our people", role: "link" },
  ];

  it("matches meaningful accessible words and rejects partial multiword guesses", () => {
    expect(rankTargets("careers page", targets)).toMatchObject({
      kind: "match",
      ids: ["careers"],
    });
    expect(rankTargets("support", targets)).toMatchObject({
      kind: "match",
      ids: ["support"],
    });
    expect(rankTargets("support people", targets)).toMatchObject({
      kind: "none",
      ids: [],
    });
    expect(rankTargets("banana", targets).kind).toBe("none");
    expect(rankTargets("", targets).kind).toBe("none");
  });

  it("asks on ties rather than depending on DOM order", () => {
    const ties = rankTargets("support", [
      ...targets,
      { id: "other-support", text: "Get support", role: "link" },
    ]);
    expect(ties).toMatchObject({
      kind: "tie",
      ids: ["support", "other-support"],
    });
  });

  it("matches accents and singular/plural names without matching unrelated substrings", () => {
    expect(
      rankTargets("cafe", [{ id: "cafe", text: "Café", role: "link" }]).kind,
    ).toBe("match");
    expect(rankTargets("career", targets).kind).toBe("match");
    expect(rankTargets("port", targets).kind).toBe("none");
  });

  it("ranks all tab titles and wraps next/previous within the current window", () => {
    const tabs = [
      { id: 10, title: "Project notes - Docs", index: 0, windowId: 1 },
      { id: 11, title: "Example", index: 1, windowId: 1 },
      { id: 12, title: "Inbox", index: 0, windowId: 2 },
    ];
    expect(rankTabs("project notes", tabs)).toMatchObject({
      kind: "match",
      ids: ["10"],
    });
    expect(adjacentTabId(tabs, 11, "next")).toBe(10);
    expect(adjacentTabId(tabs, 10, "previous")).toBe(11);
    expect(adjacentTabId(tabs, 999, "next")).toBeNull();
  });
});

describe("bounded local metrics", () => {
  it("drops oldest events and caps free text without recording invalid numbers", () => {
    let events = [] as ReturnType<typeof appendMetric>;
    for (let i = 0; i < 5; i++)
      events = appendMetric(events, { at: i, type: "fps", value: i }, 3);
    expect(events.map((event) => event.at)).toEqual([2, 3, 4]);
    const next = appendMetric(
      events,
      { at: 5, type: "heard", detail: "x".repeat(1000), value: NaN },
      3,
    );
    expect(next.at(-1)?.detail?.length).toBeLessThanOrEqual(200);
    expect(next.at(-1)?.value).toBeUndefined();
    expect(appendMetric(next, { at: NaN, type: "invalid" }, 3)).toEqual(next);
  });

  it("summarizes measured timing and outcomes, leaving unmeasured rates empty", () => {
    expect(
      summarizeMetrics([
        { at: 0, type: "run-start" },
        { at: 200, type: "command-recognized" },
        { at: 400, type: "command-unknown" },
        { at: 700, type: "activation" },
        { at: 800, type: "tracking-loss" },
        { at: 1000, type: "run-stop" },
        { at: 900, type: "fps", value: 25 },
        { at: 950, type: "fps", value: 35 },
        { at: 960, type: "latency", value: 20 },
      ]),
    ).toMatchObject({
      runCount: 1,
      durationMs: 1000,
      recognizedCommands: 1,
      unknownCommands: 1,
      activations: 1,
      trackingLosses: 1,
      averageFps: 30,
      averageLatencyMs: 20,
    });
    expect(summarizeMetrics([]).averageFps).toBeNull();
  });

  it("measures paired tasks and explicit manual mistakes without inventing accuracy", () => {
    const summary = summarizeMetrics([
      { at: 0, type: "task-complete" },
      { at: 100, type: "task-start" },
      { at: 900, type: "task-complete" },
      { at: 1000, type: "task-complete" },
      { at: 2000, type: "task-start" },
      { at: 2200, type: "task-start" },
      { at: 2400, type: "selection-error" },
      { at: 2500, type: "accidental-activation" },
      { at: 2800, type: "task-complete" },
      { at: 3000, type: "task-start" },
    ]);
    expect(summary).toMatchObject({
      completedTasks: 2,
      taskCompletionMs: 1400,
      selectionErrors: 1,
      accidentalActivations: 1,
    });
  });

  it("rejects backward task completion times and ignores invalid annotations", () => {
    expect(
      summarizeMetrics([
        { at: 1000, type: "task-start" },
        { at: 999, type: "task-complete" },
        { at: NaN, type: "selection-error" },
        { at: Infinity, type: "accidental-activation" },
      ]),
    ).toMatchObject({
      completedTasks: 0,
      taskCompletionMs: 0,
      selectionErrors: 0,
      accidentalActivations: 0,
    });
  });
});

describe('anchored local commands', () => {
  it.each([
    ['could you please scroll down please', { type: 'scroll', direction: 'down' }],
    ['click Careers', { type: 'click-target', query: 'careers' }],
    ['open C++ (Guide)', { type: 'click-target', query: 'c++ (guide)' }],
    ['search for cats in a new tab', { type: 'search', query: 'cats', background: false }],
    ['search cats in a new tab in background', { type: 'search', query: 'cats', background: true }],
    ['in the background search for cats', { type: 'search', query: 'cats', background: true }],
    ['switch to the next tab', { type: 'next-tab' }],
    ['switch to previous tab', { type: 'previous-tab' }],
    ['switch to the tab Project notes', { type: 'named-tab', name: 'project notes' }],
  ])('parses %s without a provider', (text, expected) => expect(parseIntent(text)).toEqual(expected));
});
