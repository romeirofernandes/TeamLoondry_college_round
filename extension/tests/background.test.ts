import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaults, type Message } from "../src/shared";

type Listener = (
  message: Message,
  sender: chrome.runtime.MessageSender,
  respond: (response: any) => void,
) => unknown;
const extensionSender: chrome.runtime.MessageSender = {
  id: "handsfree-test",
  url: "chrome-extension://handsfree-test/controller.html",
};
const pageSender = (id: number): chrome.runtime.MessageSender => ({
  id: "handsfree-test",
  tab: { id } as chrome.tabs.Tab,
  url: "https://example.test/",
});

async function setup(options: { tabPermission?: boolean; key?: string; jevKey?: string } = {}) {
  let listener: Listener | undefined;
  let pageDictating = false;
  const event = () => ({ addListener: vi.fn() });
  const browser = {
    storage: {
      local: {
        setAccessLevel: vi.fn(async () => {}),
        get: vi.fn(async () => ({
          settings: { ...defaults },
          providers: { groqKeys: options.key ? [options.key] : [], jevKey: options.jevKey ?? "" },
          logs: [],
        })),
        set: vi.fn(async () => {}),
      },
      session: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
    },
    runtime: {
      getURL: (path: string) => "chrome-extension://handsfree-test/" + path,
      sendMessage: vi.fn(async () => undefined),
      getContexts: vi.fn(async () => []),
      ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" },
      onMessage: {
        addListener: vi.fn((registered: Listener) => {
          listener = registered;
        }),
      },
    },
    offscreen: { createDocument: vi.fn(async () => {}), closeDocument: vi.fn(async () => {}), Reason: { USER_MEDIA: "USER_MEDIA", WORKERS: "WORKERS" } },
    permissions: { contains: vi.fn(async () => options.tabPermission ?? true) },
    scripting: { executeScript: vi.fn(async () => []) },
    extension: { isAllowedIncognitoAccess: vi.fn(async () => false) },
    tabs: {
      get: vi.fn(async (id: number) => ({
        id,
        windowId: 1,
        index: id - 1,
        url: "https://example.test/",
        title: id === 1 ? "Project notes" : "Inbox",
      })),
      query: vi.fn(async () => [
        {
          id: 1,
          windowId: 1,
          index: 0,
          url: "https://example.test/",
          title: "Project notes",
        },
        {
          id: 2,
          windowId: 1,
          index: 1,
          url: "https://example.test/inbox",
          title: "Inbox",
        },
      ]),
      sendMessage: vi.fn(async (_id: number, message: Message) => {
        if (message.type === "GET_TARGETS")
          return [{ id: "careers", text: "Careers", role: "link" }];
        if (message.type === "PAGE_STATE") pageDictating = message.dictating;
        if (message.type === "PAGE_ACTION") {
          if (message.intent.type === "start-typing") pageDictating = true;
          if (message.intent.type === "stop-typing") pageDictating = false;
          return { ok: true, dictating: pageDictating };
        }
        return { ok: true };
      }),
      create: vi.fn(async () => ({ id: 3 })),
      update: vi.fn(async () => ({})),
      remove: vi.fn(async () => {}),
      onActivated: event(),
      onUpdated: event(),
      onRemoved: event(),
    },
    windows: {
      create: vi.fn(async () => ({ tabs: [{ id: 99 }] })),
      update: vi.fn(async () => ({})),
    },
    commands: { onCommand: event() },
  };
  const fetch = vi.fn();
  vi.stubGlobal("chrome", browser);
  vi.stubGlobal("fetch", fetch);
  await import("../src/background");
  const send = (message: Message, sender = extensionSender): Promise<any> =>
    new Promise((resolve) => {
      if (!listener) throw new Error("Background listener was not registered");
      listener(message, sender, resolve);
    });
  await send({ type: "START", tabId: 1 });
  return { browser, send, fetch };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(1000);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("background command and permission boundary", () => {
  it("does no tab reads or mutations when optional tab permission is denied", async () => {
    const { browser, send } = await setup({ tabPermission: false });
    for (const text of [
      "new tab",
      "next tab",
      "close tab",
      "background search for cats",
    ])
      await send({ type: "HEARD", text });
    expect(browser.tabs.query).not.toHaveBeenCalled();
    expect(browser.tabs.create).not.toHaveBeenCalled();
    expect(browser.tabs.remove).not.toHaveBeenCalled();
    expect(browser.tabs.update).not.toHaveBeenCalled();
    expect((await send({ type: "GET_STATE" })).feedback).toContain(
      "Enable tab commands",
    );
  });

  it("only closes the requested tab after a separate confirmation", async () => {
    const { browser, send } = await setup();
    await send({ type: "HEARD", text: "close tab" });
    expect(browser.tabs.remove).not.toHaveBeenCalled();
    await send({ type: "HEARD", text: "confirm" });
    expect(browser.tabs.remove).toHaveBeenCalledExactlyOnceWith(1);
    await send({ type: "HEARD", text: "confirm" });
    expect(browser.tabs.remove).toHaveBeenCalledTimes(1);
  });

  it("does not close after confirmation expires", async () => {
    const { browser, send } = await setup();
    await send({ type: "HEARD", text: "close tab" });
    vi.setSystemTime(11001);
    await send({ type: "HEARD", text: "confirm" });
    expect(browser.tabs.remove).not.toHaveBeenCalled();
    expect((await send({ type: "GET_STATE" })).feedback).toContain("expired");
  });

  it("cancels tab close on a target change, pause, and explicit cancel", async () => {
    const { browser, send } = await setup();
    await send({ type: "HEARD", text: "close tab" });
    await send({ type: "START", tabId: 2 });
    await send({ type: "HEARD", text: "confirm" });
    await send({ type: "HEARD", text: "close tab" });
    await send({ type: "PAUSE" });
    await send({ type: "RESUME" });
    await send({ type: "HEARD", text: "confirm" });
    await send({ type: "HEARD", text: "close tab" });
    await send({ type: "HEARD", text: "cancel" });
    await send({ type: "HEARD", text: "confirm" });
    expect(browser.tabs.remove).not.toHaveBeenCalled();
  });

  it("keeps dictated command phrases as text; only exact stop typing leaves dictation", async () => {
    const { browser, send } = await setup();
    await send(
      { type: "SET_STATE", patch: { dictating: true } },
      pageSender(1),
    );
    browser.tabs.sendMessage.mockClear();
    for (const text of [
      "close tab",
      "scroll down",
      "start typing",
      "I said stop typing yesterday",
    ])
      await send({ type: "HEARD", text });
    const dictations = browser.tabs.sendMessage.mock.calls.filter(
      ([, message]) => message.type === "DICTATE",
    );
    expect(dictations.map(([, message]) => message)).toEqual([
      { type: "DICTATE", text: "close tab" },
      { type: "DICTATE", text: "scroll down" },
      { type: "DICTATE", text: "start typing" },
      { type: "DICTATE", text: "I said stop typing yesterday" },
    ]);
    expect(browser.tabs.query).not.toHaveBeenCalled();
    expect(browser.tabs.remove).not.toHaveBeenCalled();
    await send({ type: "HEARD", text: "stop typing" });
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, {
      type: "PAGE_ACTION",
      intent: { type: "stop-typing" },
    });
  });

  it("rejects privileged messages from inactive and active content scripts", async () => {
    const { browser, send } = await setup();
    for (const sender of [pageSender(1), pageSender(77)]) {
      expect(await send({ type: "GET_SETTINGS" }, sender)).toMatchObject({
        ok: false,
      });
      expect(
        await send({ type: "ACTION", intent: { type: "new-tab" } }, sender),
      ).toMatchObject({ ok: false });
      expect(
        await send(
          {
            type: "SAVE_SETTINGS",
            settings: { ...defaults, llmKey: "not-allowed" },
          },
          sender,
        ),
      ).toMatchObject({ ok: false });
    }
    expect(browser.tabs.create).not.toHaveBeenCalled();
    expect(browser.storage.local.set).not.toHaveBeenCalled();
  });

  it("routes concurrent transcripts after start typing as text, never tab commands", async () => {
    const { browser, send } = await setup();
    await Promise.all(
      ["start typing", "close tab", "confirm"].map((text) =>
        send({ type: "HEARD", text }),
      ),
    );
    expect(browser.tabs.query).not.toHaveBeenCalled();
    expect(browser.tabs.remove).not.toHaveBeenCalled();
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, {
      type: "DICTATE",
      text: "close tab",
    });
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, {
      type: "DICTATE",
      text: "confirm",
    });
  });

  it("routes concurrent transcripts after stop typing back to navigation", async () => {
    const { browser, send } = await setup();
    await send({ type: "HEARD", text: "start typing" });
    await Promise.all(
      ["stop typing", "scroll down"].map((text) =>
        send({ type: "HEARD", text }),
      ),
    );
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, {
      type: "PAGE_ACTION",
      intent: { type: "scroll", direction: "down" },
    });
    expect(browser.tabs.sendMessage).not.toHaveBeenCalledWith(1, {
      type: "DICTATE",
      text: "scroll down",
    });
  });

  it("inserts concurrent pause and stop phrases when the earlier phrase starts dictation", async () => {
    const { browser, send } = await setup();
    await Promise.all(
      ["start typing", "pause handsfree", "stop handsfree"].map((text) =>
        send({ type: "HEARD", text }),
      ),
    );
    expect(await send({ type: "GET_STATE" })).toMatchObject({
      running: true,
      paused: false,
      dictating: true,
    });
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, {
      type: "DICTATE",
      text: "pause handsfree",
    });
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, {
      type: "DICTATE",
      text: "stop handsfree",
    });
  });

  it("cannot change privileged session fields through a content state patch", async () => {
    const { send } = await setup();
    await send(
      {
        type: "SET_STATE",
        patch: {
          targetTabId: 888,
          running: false,
          camera: "fake",
          feedback: "Page message",
        },
      },
      pageSender(1),
    );
    expect(await send({ type: "GET_STATE" })).toMatchObject({
      targetTabId: 1,
      running: true,
      camera: "Off",
      feedback: "Page message",
    });
  });
});

describe("arbitrary find boundary", () => {
  it("never calls the provider or scans the page when no key is set", async () => {
    const { browser, send, fetch } = await setup();
    browser.tabs.sendMessage.mockClear();
    await send({ type: "HEARD", text: "hey handsfree careers page" });
    expect(fetch).not.toHaveBeenCalled();
    expect(browser.tabs.sendMessage).not.toHaveBeenCalledWith(1, {
      type: "GET_TARGETS",
    });
    expect((await send({ type: "GET_STATE" })).feedback).toContain(
      "Add a Groq key",
    );
  });

  it("can find page targets without optional tab-title permission", async () => {
    const { send, fetch } = await setup({
      key: "test-only-key",
      tabPermission: false,
    });
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"ids":["careers"]}' } }] }) });
    await send({ type: "HEARD", text: "hey handsfree careers page" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects invented provider target IDs without highlighting or activating them", async () => {
    const { browser, send, fetch } = await setup({ key: "test-only-key" });
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"ids":["invented"]}' } }],
      }),
    });
    await send({ type: "HEARD", text: "hey handsfree careers page" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      browser.tabs.sendMessage.mock.calls.some(
        ([, message]) => message.type === "FIND_RESULT",
      ),
    ).toBe(false);
    expect((await send({ type: "GET_STATE" })).feedback).toContain(
      "Invalid target IDs",
    );
  });

  it("sends only labels and the query, highlights valid IDs, and never clicks a match", async () => {
    const { browser, send, fetch } = await setup({ key: "test-only-key" });
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"ids":["careers"]}' } }],
      }),
    });
    await send({ type: "HEARD", text: "hey handsfree careers page" });
    const request = JSON.parse(fetch.mock.calls[0][1].body);
    expect(JSON.parse(request.messages[1].content)).toEqual({
      phrase: "careers page",
      targets: [{ id: "careers", text: "Careers", role: "link" }],
    });
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, {
      type: "FIND_RESULT",
      ids: ["careers"],
    });
    expect(
      browser.tabs.sendMessage.mock.calls.some(
        ([, message]) =>
          message.type === "PAGE_ACTION" && message.intent.type === "click",
      ),
    ).toBe(false);
  });

  it("cancels a provider response after pause while the request was pending", async () => {
    const { browser, send, fetch } = await setup({ key: "test-only-key" });
    let resolveFetch: (response: unknown) => void = () => {};
    const started = new Promise<void>((resolve) => {
      fetch.mockImplementation(() => {
        resolve();
        return new Promise((resolver) => {
          resolveFetch = resolver;
        });
      });
    });
    const request = send({ type: "HEARD", text: "hey handsfree careers page" });
    await started;
    await send({ type: "PAUSE" });
    resolveFetch({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"ids":["careers"]}' } }],
      }),
    });
    await request;
    expect(
      browser.tabs.sendMessage.mock.calls.some(
        ([, message]) => message.type === "FIND_RESULT",
      ),
    ).toBe(false);
  });

  it("does not resurrect a cancelled find after pause followed by resume", async () => {
    const { browser, send, fetch } = await setup({ key: "test-only-key" });
    let resolveFetch: (response: unknown) => void = () => {};
    const started = new Promise<void>((resolve) => {
      fetch.mockImplementation(() => {
        resolve();
        return new Promise((resolver) => {
          resolveFetch = resolver;
        });
      });
    });
    const request = send({ type: "HEARD", text: "hey handsfree careers page" });
    await started;
    await send({ type: "PAUSE" });
    await send({ type: "RESUME" });
    resolveFetch({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"ids":["careers"]}' } }],
      }),
    });
    await request;
    expect(
      browser.tabs.sendMessage.mock.calls.some(
        ([, message]) => message.type === "FIND_RESULT",
      ),
    ).toBe(false);
  });

  it("discards old-page IDs after navigation within the same tab", async () => {
    const { browser, send, fetch } = await setup({ key: "test-only-key" });
    let resolveFetch: (response: unknown) => void = () => {};
    const started = new Promise<void>((resolve) => {
      fetch.mockImplementation(() => {
        resolve();
        return new Promise((resolver) => {
          resolveFetch = resolver;
        });
      });
    });
    const request = send({ type: "HEARD", text: "hey handsfree careers page" });
    await started;
    const updateListener = browser.tabs.onUpdated.addListener.mock
      .calls[0][0] as (id: number, change: { status: string }) => void;
    updateListener(1, { status: "loading" });
    await send({ type: "GET_STATE" });
    resolveFetch({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"ids":["careers"]}' } }],
      }),
    });
    await request;
    expect(
      browser.tabs.sendMessage.mock.calls.some(
        ([, message]) => message.type === "FIND_RESULT",
      ),
    ).toBe(false);
  });

  it.each(["pause handsfree", "stop handsfree"])(
    "interrupts an in-flight provider request with %s",
    async (text) => {
      const { browser, send, fetch } = await setup({ key: "test-only-key" });
      let resolveFetch: (response: unknown) => void = () => {};
      const started = new Promise<void>((resolve) => {
        fetch.mockImplementation(() => {
          resolve();
          return new Promise((resolver) => {
            resolveFetch = resolver;
          });
        });
      });
      const request = send({ type: "HEARD", text: "hey handsfree careers page" });
      await started;
      await send({ type: "HEARD", text });
      expect(await send({ type: "GET_STATE" })).toMatchObject(
        text === "pause handsfree" ? { paused: true } : { running: false },
      );
      resolveFetch({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"ids":["careers"]}' } }],
        }),
      });
      await request;
      expect(
        browser.tabs.sendMessage.mock.calls.some(
          ([, message]) => message.type === "FIND_RESULT",
        ),
      ).toBe(false);
    },
  );

  it.each(["pause-resume", "target-change"])(
    "discards queued speech actions after %s",
    async (change) => {
      const { browser, send, fetch } = await setup({ key: "test-only-key" });
      let resolveFetch: (response: unknown) => void = () => {};
      const started = new Promise<void>((resolve) => {
        fetch.mockImplementation(() => {
          resolve();
          return new Promise((resolver) => {
            resolveFetch = resolver;
          });
        });
      });
      const request = send({ type: "HEARD", text: "hey handsfree careers page" });
      await started;
      const queued = send({ type: "HEARD", text: "close tab" });
      await send({ type: "GET_STATE" });
      if (change === "pause-resume") {
        await send({ type: "PAUSE" });
        await send({ type: "RESUME" });
      } else await send({ type: "START", tabId: 2 });
      resolveFetch({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"ids":["careers"]}' } }],
        }),
      });
      await Promise.all([request, queued]);
      expect(browser.tabs.query).not.toHaveBeenCalled();
      await send({ type: "HEARD", text: "confirm" });
      expect(browser.tabs.remove).not.toHaveBeenCalled();
    },
  );
});

 describe("Jev emergency interruption", () => {
  it("pauses immediately while ordinary speech mapping is pending", async () => {
    const { send, fetch, browser } = await setup({ jevKey: "test-only-jev" });
    let resolveFetch: (response: unknown) => void = () => {};
    const started = new Promise<void>(resolve => fetch.mockImplementation(() => {
      resolve(); return new Promise(resolver => { resolveFetch = resolver; });
    }));
    const request = send({ type: "HEARD", text: "move a little further down" });
    await started;
    await send({ type: "HEARD", text: "pause handsfree" });
    expect(await send({ type: "GET_STATE" })).toMatchObject({ paused: true });
    resolveFetch({ ok: true, json: async () => ({}) });
    await request;
    expect(browser.tabs.sendMessage).not.toHaveBeenCalledWith(1, { type: "PAGE_ACTION", intent: { type: "scroll", direction: "down" } });
  });
});
