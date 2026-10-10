import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mapCommand,
  resolveArbitrary,
  transcribeAudio,
  validateIntent,
} from "../src/providers";

const keys = [
  "fixture-key-one",
  "fixture-key-two",
  "fixture-key-three",
  "fixture-key-four",
  "fixture-key-five",
];
const targets = [{ id: "careers", text: "Careers", role: "link" }];
const completion = (value: unknown) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: JSON.stringify(value) } }],
  }),
});
let request: ReturnType<typeof vi.fn>;
beforeEach(() => {
  request = vi.fn();
  vi.stubGlobal("fetch", request);
});
afterEach(() => vi.unstubAllGlobals());

describe("Jev finite command mapping", () => {
  it("selects an existing tab from natural language and advertises media actions to both judgments", async () => {
    request.mockResolvedValue({ ok: true, json: async () => ({ answers: {
      command: { type: "choice", choice: "tab-0", confidence: 0.97, probabilities: { "tab-0": 0.97 } },
      direct: { type: "noul", noul: 0.96 },
    } }) });
    expect(await mapCommand("bring my inbox to the front", { jevKey: "fixture", language: "en-IN", tabs: [{ id: 4, title: "Inbox" }] })).toEqual({ type: "named-tab", name: "Inbox" });
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body.questions.command.criteria["media-pause"]).toContain("video");
    expect(body.questions.direct.instructions).toContain("media-pause");
    expect(body.questions.command.criteria["scroll-bottom"]).toContain("bottom");
  });
  it("keeps exact commands available without a key and makes unknown speech a no-op", async () => {
    expect(
      await mapCommand("scroll down", { jevKey: "", language: "en-US" }),
    ).toEqual({ type: "scroll", direction: "down" });
    expect(
      await mapCommand("could you move a little lower", {
        jevKey: "",
        language: "en-US",
      }),
    ).toEqual({ type: "unknown", heard: "could you move a little lower" });
    expect(request).not.toHaveBeenCalled();
  });

  it("maps a free phrase through the actual TypeSafe questions API", async () => {
    request.mockResolvedValue({
      ok: true,
      json: async () => ({
        answers: {
          command: {
            type: "choice",
            choice: "scroll-down",
            confidence: 0.98,
            probabilities: { "scroll-down": 0.99, none: 0.01 },
          },
          direct: { type: "noul", noul: 0.99 },
        },
      }),
    });
    expect(
      await mapCommand("a little lower please", {
        jevKey: "fixture-jev-key",
        language: "en-IN",
      }),
    ).toEqual({ type: "scroll", direction: "down" });
    expect(request.mock.calls[0][0]).toBe(
      "https://api.typesafe.ai/v1/systemone",
    );
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body.model).toBe("jev-1.13.0");
    expect(body.state).toEqual({
      utterance: "a little lower please",
      language: "en-IN",
    });
    expect(body.questions.command).toMatchObject({
      type: "choice",
      criteria: { "scroll-down": expect.any(String), none: expect.any(String) },
    });
    expect(body.questions.direct.type).toBe("noul");
  });

  it("uses the OpenRouter decisions endpoint rather than chat completions", async () => {
    request.mockResolvedValue({
      ok: true,
      json: async () => ({
        answers: {
          command: {
            type: "choice",
            choice: "click",
            confidence: 0.99,
            probabilities: { click: 1 },
          },
          direct: { type: "noul", noul: 0.99 },
        },
      }),
    });
    expect(
      await mapCommand("select this please", {
        jevKey: "fixture-openrouter-key",
        jevProvider: "openrouter",
        language: "en-US",
      }),
    ).toEqual({ type: "click" });
    expect(request.mock.calls[0][0]).toBe(
      "https://openrouter.ai/api/alpha/decisions",
    );
    expect(JSON.parse(request.mock.calls[0][1].body).model).toBe(
      "typesafe/jev-1.13",
    );
  });

  it.each([
    {
      choice: "scroll-down",
      confidence: 0.2,
      probabilities: { "scroll-down": 0.51 },
    },
    {
      choice: "execute-javascript",
      confidence: 1,
      probabilities: { "execute-javascript": 1 },
    },
    { choice: "click", confidence: 1, probabilities: { click: 0.5 } },
  ])("rejects uncertain or unlisted results %j", async (answer) => {
    request.mockResolvedValue({
      ok: true,
      json: async () => ({
        answers: {
          command: { type: "choice", ...answer },
          direct: { type: "noul", noul: 0.99 },
        },
      }),
    });
    expect(
      (
        await mapCommand("a phrase", {
          jevKey: "fixture-key",
          language: "en-US",
        })
      ).type,
    ).toBe("unknown");
  });

  it("keeps emergency commands immediate and reserves arbitrary find for the wake route", async () => {
    expect(
      await mapCommand("pause handsfree", {
        jevKey: "fixture-key",
        language: "en-US",
      }),
    ).toEqual({ type: "pause" });
    expect(
      (await mapCommand("find careers", { jevKey: "", language: "en-US" }))
        .type,
    ).toBe("unknown");
    expect(request).not.toHaveBeenCalled();
  });
  it("requires a direct request even when the action classification is confident", async () => {
    request.mockResolvedValue({
      ok: true,
      json: async () => ({
        answers: {
          command: {
            type: "choice",
            choice: "click",
            confidence: 1,
            probabilities: { click: 1 },
          },
          direct: { type: "noul", noul: 0.1 },
        },
      }),
    });
    expect(
      (
        await mapCommand("my friend said click", {
          jevKey: "fixture-key",
          language: "en-US",
        })
      ).type,
    ).toBe("unknown");
  });
  it("retains exact parsed arguments locally without sending page data to Jev", async () => {
    expect(await mapCommand("search for accessible design", { jevKey: "fixture-key", language: "en-US" })).toEqual({
      type: "search", query: "accessible design", background: false,
    });
    expect(request).not.toHaveBeenCalled();
  });
});

it("reconstructs supported Groq shorthand and bounded media intents", () => {
  expect(validateIntent("media-pause")).toEqual({ type: "media-pause" });
  expect(validateIntent("execute-script")).toBeNull();
  expect(validateIntent({ type: "media-seek", seconds: -10 })).toEqual({ type: "media-seek", seconds: -10 });
  expect(validateIntent({ type: "media-seek", seconds: Infinity })).toBeNull();
  expect(validateIntent({ type: "media-seek", seconds: 601 })).toBeNull();
});

describe("Groq bounded actions and target IDs", () => {
  it("uses the requested model with no reasoning text and validates returned IDs", async () => {
    request.mockResolvedValue(completion({ ids: ["careers"] }));
    expect(
      await resolveArbitrary("find jobs", targets, {
        groqKeys: keys,
        groqModel: "qwen/qwen3.8-27b",
      }),
    ).toEqual({ ids: ["careers"] });
    expect(request.mock.calls[0][0]).toBe(
      "https://api.groq.com/openai/v1/chat/completions",
    );
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: "qwen/qwen3.8-27b",
      reasoning_effort: "none",
      response_format: { type: "json_object" },
    });
    expect(JSON.parse(body.messages[1].content)).toEqual({
      phrase: "find jobs",
      targets,
    });
  });

  it.each([
    { ids: ["invented"] },
    { ids: [], intent: { type: "eval", code: "alert(1)" } },
    { ids: [], intent: { type: "scroll", direction: "sideways" } },
  ])("rejects unsafe provider output %j", async (output) => {
    request.mockResolvedValue(completion(output));
    await expect(
      resolveArbitrary("do something", targets, { groqKeys: keys }),
    ).rejects.toThrow(/invalid|unsupported/i);
  });

  it("keeps safe browser intents typed, including separate confirmation requests", async () => {
    request.mockResolvedValue(
      completion({ ids: [], intent: { type: "close-tab" } }),
    );
    expect(
      await resolveArbitrary("close the tab I am on", targets, {
        groqKeys: keys,
      }),
    ).toEqual({ ids: [], intent: { type: "close-tab" } });
    expect(
      validateIntent({ type: "search", query: "cats", background: true }),
    ).toEqual({ type: "search", query: "cats", background: true });
    expect(validateIntent({ type: "choose", index: 999 })).toBeNull();
  });

  it("reserves different durable key slots even for parallel requests", async () => {
    let index = 0;
    const keyIndexStore = {
      get: vi.fn(async () => index),
      set: vi.fn(async (next: number) => {
        index = next;
      }),
    };
    request.mockResolvedValue(completion({ ids: [] }));
    await Promise.all(
      Array.from({ length: 6 }, () =>
        resolveArbitrary("find something", targets, {
          groqKeys: keys,
          keyIndexStore,
        }),
      ),
    );
    expect(
      request.mock.calls.map(([, options]) => options.headers.Authorization),
    ).toEqual([keys[0], keys[1], keys[2], keys[3], keys[0], keys[1]].map((key) => "Bearer " + key));
    expect(index).toBe(2);
  });

  it("accepts the full page target bound and rejects oversized target lists before network access", async () => {
    const pageTargets = Array.from({ length: 1500 }, (_, index) => ({
      id: `target-${index}`, text: `Link ${index}`, role: "link",
    }));
    request.mockResolvedValue(completion({ ids: ["target-1499"] }));
    expect(await resolveArbitrary("find the last link", pageTargets, { groqKeys: keys })).toEqual({ ids: ["target-1499"] });
    request.mockClear();
    await expect(resolveArbitrary("find the last link", [...pageTargets, targets[0]], { groqKeys: keys })).rejects.toThrow("Invalid target list");
    expect(request).not.toHaveBeenCalled();
  });

  it("reports a rate limit without retrying across keys or exposing credentials", async () => {
    request.mockResolvedValue({ ok: false, status: 429 });
    await expect(
      resolveArbitrary("find jobs", targets, { groqKeys: keys }),
    ).rejects.toThrow(/rate limit/i);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("honors abort before consuming a key or fetching", async () => {
    const abort = new AbortController();
    abort.abort();
    const keyIndexStore = {
      get: vi.fn(async () => 0),
      set: vi.fn(async () => {}),
    };
    await expect(
      resolveArbitrary(
        "find jobs",
        targets,
        { groqKeys: keys, keyIndexStore },
        abort.signal,
      ),
    ).rejects.toThrow();
    expect(keyIndexStore.set).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("explicit cloud speech transcription", () => {
  it("uploads only the audio chunk with ISO language and the multilingual Whisper model", async () => {
    request.mockResolvedValue({
      ok: true,
      json: async () => ({ text: "नमस्ते" }),
    });
    expect(
      await transcribeAudio(new Blob(["sound"], { type: "audio/webm" }), {
        groqKeys: keys,
        language: "hi-IN",
      }),
    ).toBe("नमस्ते");
    expect(request.mock.calls[0][0]).toBe(
      "https://api.groq.com/openai/v1/audio/transcriptions",
    );
    const form = request.mock.calls[0][1].body as FormData;
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect(form.get("language")).toBe("hi");
    expect(form.get("file")).toBeInstanceOf(Blob);
    expect(form.has("api_key")).toBe(false);
  });

  it("lets Whisper detect language automatically and refuses empty recordings", async () => {
    request.mockResolvedValue({
      ok: true,
      json: async () => ({ text: "Hello" }),
    });
    await transcribeAudio(new Blob(["sound"], { type: "audio/webm" }), {
      groqKeys: keys,
      language: "auto",
    });
    expect((request.mock.calls[0][1].body as FormData).has("language")).toBe(
      false,
    );
    await expect(
      transcribeAudio(new Blob([]), { groqKeys: keys, language: "en-US" }),
    ).rejects.toThrow(/empty/i);
  });

  it("returns no transcript when provider metadata reports only silence", async () => {
    request.mockResolvedValue({
      ok: true,
      json: async () => ({
        text: "Thanks for watching.",
        segments: [{ no_speech_prob: 0.98 }],
      }),
    });
    expect(
      await transcribeAudio(new Blob(["silence"], { type: "audio/webm" }), {
        groqKeys: keys,
        language: "en-US",
      }),
    ).toBe("");
  });
});

describe('local priority and textual assistance regressions', () => {
  it.each(['scroll down', 'click this', 'please scroll up', 'open Careers', 'next tab', 'search for cats in a new tab in background'])(
    'executes %s without a functioning provider', async text => {
      request.mockRejectedValue(new Error('offline'));
      const result = await mapCommand(text, { jevKey: 'fixture-key', language: 'en-US' });
      expect(result.type).not.toBe('unknown');
      expect(request).not.toHaveBeenCalled();
    });
  it('returns a bounded answer as data with safe page context', async () => {
    request.mockResolvedValue(completion({ ids: [], intent: null, answer: '<b>Public summary</b>' }));
    const pageContext = { title: 'Article', url: 'https://example.test/', text: 'Public article' };
    expect(await resolveArbitrary('summarize this page', [], { groqKeys: keys }, undefined, pageContext)).toEqual({ ids: [], answer: '<b>Public summary</b>' });
    expect(JSON.parse(JSON.parse(request.mock.calls[0][1].body).messages[1].content).page).toEqual(pageContext);
  });
  it.each([
    { ids: ['careers'], answer: 'text' },
    { ids: [], intent: { type: 'click' }, answer: 'text' },
    { ids: [], answer: 'x'.repeat(6001) },
    { ids: [], answer: 42 },
    { ids: [], intent: { type: 'click-target', query: '' } },
  ])('rejects malformed or combined answer results', async output => {
    request.mockResolvedValue(completion(output));
    await expect(resolveArbitrary('answer me', targets, { groqKeys: keys })).rejects.toThrow(/invalid|unsupported/i);
  });
});


describe("wake named control actions", () => {
  it.each([
    { ids: ["careers"] },
    { ids: [] },
    { ids: [], intent: { type: "click" } },
  ])("keeps an explicit named action bound to the original local query for valid provider output %j", async output => {
    request.mockResolvedValue(completion(output));
    expect(await resolveArbitrary("open Submit example form", targets, { groqKeys: keys })).toEqual({ ids: [], intent: { type: "click-target", query: "submit example form" } });
  });

  it("accepts bounded named clicks and discards extra provider fields", async () => {
    request.mockResolvedValue(completion({ ids: [], intent: { type: "click-target", query: "  Careers  ", html: "<script>bad()</script>" } }));
    expect(await resolveArbitrary("select the Careers control", targets, { groqKeys: keys })).toEqual({ ids: [], intent: { type: "click-target", query: "Careers" } });
    expect(validateIntent({ type: "click-target", query: " " })).toBeNull();
    expect(validateIntent({ type: "click-target", query: "x".repeat(501) })).toBeNull();
  });
  it.each([
    { ids: ["careers"], intent: { type: "click-target", query: "Careers" } },
    { ids: [], answer: "Hello", intent: { type: "click-target", query: "Careers" } },
  ])("rejects combined named clicks %j", async output => {
    request.mockResolvedValue(completion(output));
    await expect(resolveArbitrary("open Careers", targets, { groqKeys: keys })).rejects.toThrow(/invalid|combined/i);
  });
});

describe("independent Jev rotation and bounded failover", () => {
  const output = { answers: { command: { type: "choice", choice: "scroll-down", confidence: 0.99, probabilities: { "scroll-down": 1 } }, direct: { type: "noul", noul: 0.99 } } };
  const ok = () => ({ ok: true, json: async () => output });
  it("deduplicates legacy and list keys and persists separate round-robin slots", async () => {
    let slot = 0; const jevKeyIndexStore = { get: async () => slot, set: async (n: number) => { slot = n; } };
    request.mockImplementation(async () => ok());
    for (let n = 0; n < 3; n++) await mapCommand("a little lower", { jevKey: "dummy-a", jevKeys: ["dummy-a", "dummy-b"], jevKeyIndexStore, language: "en-US" });
    expect(request.mock.calls.map(([, init]) => init.headers.Authorization)).toEqual(["Bearer dummy-a", "Bearer dummy-b", "Bearer dummy-a"]); expect(slot).toBe(1);
  });
  it.each([401, 403, 429, 500, 503])("fails over once per key for HTTP %s", async status => {
    request.mockResolvedValueOnce({ ok: false, status }).mockResolvedValueOnce(ok());
    expect(await mapCommand("lower please", { jevKey: "dummy-a", jevKeys: ["dummy-b"], language: "en-US" })).toEqual({ type: "scroll", direction: "down" }); expect(request).toHaveBeenCalledTimes(2);
  });
  it("does not retry semantic output or non-transient errors", async () => {
    request.mockResolvedValue({ ok: true, json: async () => ({ answers: {} }) });
    expect((await mapCommand("lower please", { jevKey: "dummy-a", jevKeys: ["dummy-b"], language: "en-US" })).type).toBe("unknown"); expect(request).toHaveBeenCalledTimes(1);
    request.mockClear().mockResolvedValue({ ok: false, status: 400 });
    await expect(mapCommand("lower please", { jevKey: "dummy-a", jevKeys: ["dummy-b"], language: "en-US" })).rejects.toThrow(); expect(request).toHaveBeenCalledTimes(1);
  });
  it("cancels before failover and never sends exact navigation to Jev", async () => {
    const abort = new AbortController(); request.mockImplementation(async () => { abort.abort(); return { ok: false, status: 429 }; });
    await expect(mapCommand("lower please", { jevKey: "dummy-a", jevKeys: ["dummy-b"], language: "en-US" }, abort.signal)).rejects.toThrow(); expect(request).toHaveBeenCalledTimes(1);
    request.mockClear(); await mapCommand("click the first link", { jevKey: "dummy-a", jevKeys: ["dummy-b"], language: "en-US" }); expect(request).not.toHaveBeenCalled();
  });
});
describe("Jev transport failure bounds", () => {
  it("tries each deduplicated key at most once and hides network details", async () => {
    request.mockRejectedValue(new TypeError("dummy-secret-from-network"));
    await expect(mapCommand("lower please", { jevKey: "dummy-a", jevKeys: ["dummy-a", "dummy-b"], language: "en-US" })).rejects.toThrow("Jev request unavailable");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("never consumes a Jev slot when already cancelled", async () => {
    const abort = new AbortController(); abort.abort();
    const store = { get: vi.fn(async () => 0), set: vi.fn(async () => {}) };
    await expect(mapCommand("lower please", { jevKeys: ["dummy-a"], jevKeyIndexStore: store, language: "en-US" }, abort.signal)).rejects.toThrow();
    expect(store.set).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
  });
  it("validates navigation arguments and discards provider URL fields", () => {
    expect(validateIntent({ type: "click-link", index: 2, disposition: "background", url: "javascript:alert(1)" })).toEqual({ type: "click-link", index: 2, disposition: "background" });
    expect(validateIntent({ type: "click-link", index: 11 })).toBeNull();
    expect(validateIntent({ type: "click-target", query: "ChatGPT", disposition: "privileged" })).toBeNull();
    expect(validateIntent({ type: "focus-target", query: "search" })).toEqual({ type: "focus-target", query: "search" });
  });
});
