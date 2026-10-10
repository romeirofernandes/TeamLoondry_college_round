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
  it("retains parsed arguments only through a listed candidate and sends no page data to Jev", async () => {
    request.mockResolvedValue({
      ok: true,
      json: async () => ({
        answers: {
          command: {
            type: "choice",
            choice: "parsed-command",
            confidence: 1,
            probabilities: { "parsed-command": 1 },
          },
          direct: { type: "noul", noul: 1 },
        },
      }),
    });
    expect(
      await mapCommand("search for accessible design", {
        jevKey: "fixture-key",
        language: "en-US",
      }),
    ).toEqual({
      type: "search",
      query: "accessible design",
      background: false,
    });
    expect(
      Object.keys(JSON.parse(request.mock.calls[0][1].body).state),
    ).toEqual(["utterance", "language"]);
  });
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
    ).toEqual([...keys, keys[0]].map((key) => "Bearer " + key));
    expect(index).toBe(1);
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
