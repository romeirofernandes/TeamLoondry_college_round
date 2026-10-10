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

async function setup(options: { tabPermission?: boolean; key?: string; jevKey?: string; settings?: Record<string, unknown>; legacySettings?: Record<string, unknown> } = {}) {
  let listener: Listener | undefined;
  let pageDictating = false;
  const event = () => ({ addListener: vi.fn() });
  const browser = {
    storage: {
      local: {
        setAccessLevel: vi.fn(async () => {}),
        get: vi.fn(async () => ({
          settings: options.legacySettings ?? { ...defaults, ...options.settings },
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
        active: true,
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
      update: vi.fn(async (_id: number, _options: chrome.tabs.UpdateProperties) => ({})),
      remove: vi.fn(async () => {}),
      onActivated: event(),
      onUpdated: event(),
      onRemoved: event(),
    },
    windows: {
      create: vi.fn(async () => ({ tabs: [{ id: 99 }] })),
      get: vi.fn(async () => ({focused:true})),
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
  it("keeps setup speech in the active trusted dashboard and drops it after navigation", async () => {
    const {browser,send}=await setup();
    await send({type:"STOP"});await send({type:"OPEN_DASHBOARD"});
    browser.tabs.get.mockImplementation(async(id)=>({id,windowId:1,index:0,url:id===3?defaults.dashboardUrl:"https://example.test/",title:"Dashboard",active:true}));
    const dashboardSender={id:"handsfree-test",tab:{id:3} as chrome.tabs.Tab,url:defaults.dashboardUrl};
    expect(await send({type:"UI_VOICE",enabled:true},dashboardSender)).toMatchObject({ok:false});
    await send({type:"MEDIA_PERMISSIONS",camera:"prompt",microphone:"granted"});
    expect(await send({type:"UI_VOICE",enabled:true},dashboardSender)).toMatchObject({ok:true});
    browser.tabs.sendMessage.mockClear();
    await send({type:"UI_HEARD",text:"choose voice"});
    expect(browser.tabs.sendMessage).toHaveBeenCalledExactlyOnceWith(3,{type:"UI_HEARD",text:"choose voice"});
    expect(await send({type:"GET_STATE"})).toMatchObject({running:false});
    browser.tabs.get.mockResolvedValue({id:3,windowId:1,index:0,url:"https://example.test/",title:"Other page",active:true});
    browser.tabs.sendMessage.mockClear();await send({type:"UI_HEARD",text:"new tab"});
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  });
  it("reuses a permission window and passes only the chosen devices",async()=>{
    const {browser,send}=await setup({settings:{voiceOnly:true}});
    await send({type:"GRANT_PERMISSIONS",kind:"devices",camera:false,microphone:true,returnHash:"#setup"});
    expect(browser.windows.create).toHaveBeenCalledWith(expect.objectContaining({url:expect.stringContaining("camera=false&microphone=true")}));
    browser.tabs.query.mockResolvedValue([{id:99,windowId:9,index:0,url:"chrome-extension://handsfree-test/permissions.html?kind=devices",title:"Browser access"}]);
    await send({type:"GRANT_PERMISSIONS",kind:"tabs"});
    expect(browser.windows.create).toHaveBeenCalledTimes(1);
    expect(browser.tabs.update).toHaveBeenCalledWith(99,expect.objectContaining({url:expect.stringContaining("kind=tabs")}));
  });
  it("switches only to a selected pointer without resuming a paused session", async () => {
    const { send } = await setup({ settings: { enabledInputs: ["voice", "face", "hand"] } });
    await send({ type: "PAUSE" });
    await send({ type: "ACTION", intent: { type: "switch-pointer", mode: "hand" } });
    expect(await send({ type: "GET_SETTINGS" })).toMatchObject({ pointerMode: "hand", enabledInputs: ["voice", "face", "hand"] });
    expect(await send({ type: "GET_STATE" })).toMatchObject({ paused: true });
  });
  it("rejects switching to an unselected input", async () => {
    const { send } = await setup({ settings: { enabledInputs: ["voice", "face"] } });
    await send({ type: "HEARD", text: "switch to hands" });
    expect(await send({ type: "GET_SETTINGS" })).toMatchObject({ pointerMode: "face" });
    expect(await send({ type: "GET_STATE" })).toMatchObject({ feedback: "Select this input in Profile and preferences first." });
  });
  it("opens a new tab from ordinary phrasing without selecting a page target", async () => {
    const { browser, send } = await setup();
    await send({ type: "HEARD", text: "open a fresh tab please" });
    expect(browser.tabs.create).toHaveBeenCalledWith({ url: "about:blank" });
  });
  it("accepts configurable resume speech while paused and ignores other speech", async () => {
    const { browser, send } = await setup({ settings: { pausePhrase: "take a break", resumePhrase: "carry on" } });
    await send({ type: "HEARD", text: "take a break" });
    expect(await send({ type: "GET_STATE" })).toMatchObject({ paused: true });
    await send({ type: "HEARD", text: "new tab" });
    expect(browser.tabs.create).not.toHaveBeenCalled();
    await send({ type: "HEARD", text: "carry on" });
    expect(await send({ type: "GET_STATE" })).toMatchObject({ paused: false });
  });
  it("arms the wake route across separate final transcripts", async () => {
    const { send, fetch } = await setup({ key: "fixture-key" });
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ ids: [], intent: { type: "new-tab" } }) } }] }) });
    await send({ type: "HEARD", text: "Hey, Hands Free." });
    expect(fetch).not.toHaveBeenCalled();
    await send({ type: "HEARD", text: "open a fresh tab" });
    expect(fetch.mock.calls[0]?.[0]).toBe("https://api.groq.com/openai/v1/chat/completions");
  });
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

  it("reserves universal session controls even when dictation is starting", async () => {
    const { browser, send } = await setup();
    await Promise.all(["start typing", "pause handsfree", "stop handsfree"].map(text => send({ type: "HEARD", text })));
    expect(await send({ type: "GET_STATE" })).toMatchObject({ running: false, dictating: false });
    expect(browser.tabs.sendMessage).not.toHaveBeenCalledWith(1, { type: "DICTATE", text: "pause handsfree" });
    expect(browser.tabs.sendMessage).not.toHaveBeenCalledWith(1, { type: "DICTATE", text: "stop handsfree" });
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

describe('final speech routing regressions', () => {
  it('dispatches local commands with Jev unavailable and retains background search arguments', async () => {
    const { browser, send, fetch } = await setup({ jevKey: 'fixture-jev' });
    fetch.mockRejectedValue(new Error('offline'));
    await send({ type: 'HEARD', text: 'scroll down' });
    await send({ type: 'HEARD', text: 'search for accessible design in a new tab in background' });
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'PAGE_ACTION', intent: { type: 'scroll', direction: 'down' } });
    expect(browser.tabs.create).toHaveBeenCalledWith({ url: 'https://www.google.com/search?q=accessible%20design', active: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('clicks immediately during provider work and suppresses its stale action', async () => {
    const { browser, send, fetch } = await setup({ key: 'fixture-groq' });
    let finish!: (response: unknown) => void;
    const started = new Promise<void>(resolve => fetch.mockImplementation(() => {
      resolve(); return new Promise(resolver => { finish = resolver; });
    }));
    const pending = send({ type: 'HEARD', text: 'hey handsfree move down a little' });
    await started;
    let clickDone = false;
    const clicked = send({ type: 'HEARD', text: 'click this' }).then(() => { clickDone = true; });
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(clickDone).toBe(true);
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'PAGE_ACTION', intent: { type: 'click' } });
    finish({ ok: true, json: async () => ({ choices: [{ message: { content: '{"ids":[],"intent":{"type":"scroll","direction":"down"}}' } }] }) });
    await Promise.all([pending, clicked]);
    expect(browser.tabs.sendMessage).not.toHaveBeenCalledWith(1, { type: 'PAGE_ACTION', intent: { type: 'scroll', direction: 'down' } });
  });
  it('answers a wake question even when target scanning is unavailable', async () => {
    const { browser, send, fetch } = await setup({ key: 'fixture-groq' });
    const original = browser.tabs.sendMessage.getMockImplementation()!;
    browser.tabs.sendMessage.mockImplementation(async (id, message) => {
      if (message.type === 'GET_TARGETS') return { ok: false, error: 'No targets available' } as any;
      if (message.type === 'GET_PAGE_CONTEXT') return { title: 'Article', url: 'https://example.test/', text: 'Public text' } as any;
      return original(id, message);
    });
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"ids":[],"answer":"A useful answer"}' } }] }) });
    await send({ type: 'HEARD', text: 'hey handsfree what does this page explain?' });
    expect((await send({ type: 'GET_STATE' })).feedback).toBe('A useful answer');
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'ANSWER', text: 'A useful answer' });
    expect(JSON.parse(JSON.parse(fetch.mock.calls[0][1].body).messages[1].content).page.text).toBe('Public text');
  });
  it('surfaces failed page dispatch and never executes interim text', async () => {
    const { browser, send } = await setup();
    await send({ type: 'TRANSCRIPT', text: 'click this', final: false });
    expect(browser.tabs.sendMessage.mock.calls.some(([,m]) => m.type === 'PAGE_ACTION')).toBe(false);
    browser.tabs.sendMessage.mockRejectedValue(new Error('Disconnected'));
    await send({ type: 'HEARD', text: 'click this' });
    expect((await send({ type: 'GET_STATE' })).feedback).toContain('page is unavailable');
  });
});

describe('provider cancellation ordering', () => {
  it('keeps a click behind an earlier start-typing transcript during provider work', async () => {
    const { browser, send, fetch } = await setup({ key: 'fixture-groq' });
    let finish!: (response: unknown) => void;
    const started = new Promise<void>(resolve => fetch.mockImplementation(() => {
      resolve(); return new Promise(resolver => { finish = resolver; });
    }));
    const provider = send({ type: 'HEARD', text: 'hey handsfree help' });
    await started;
    const typing = send({ type: 'HEARD', text: 'start typing' });
    const clicking = send({ type: 'HEARD', text: 'click this' });
    finish({ ok: true, json: async () => ({ choices: [{ message: { content: '{"ids":[]}' } }] }) });
    await Promise.all([provider, typing, clicking]);
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'DICTATE', text: 'click this' });
    expect(browser.tabs.sendMessage).not.toHaveBeenCalledWith(1, { type: 'PAGE_ACTION', intent: { type: 'click' } });
  });
  it.each(['PAUSE', 'STOP', 'cancel'] as const)('discards a pending answer after %s', async change => {
    const { browser, send, fetch } = await setup({ key: 'fixture-groq' });
    let finish!: (response: unknown) => void;
    const started = new Promise<void>(resolve => fetch.mockImplementation(() => {
      resolve(); return new Promise(resolver => { finish = resolver; });
    }));
    const provider = send({ type: 'HEARD', text: 'hey handsfree what is two plus two?' });
    await started;
    await send(change === 'cancel' ? { type: 'HEARD', text: 'cancel' } : { type: change });
    finish({ ok: true, json: async () => ({ choices: [{ message: { content: '{"ids":[],"answer":"Stale answer"}' } }] }) });
    await provider;
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(browser.tabs.sendMessage).not.toHaveBeenCalledWith(1, { type: 'ANSWER', text: 'Stale answer' });
    expect((await send({ type: 'GET_STATE' })).feedback).not.toBe('Stale answer');
  });
  it('cancels pending provider actions when controls enter dictation directly', async () => {
    const { browser, send, fetch } = await setup({ key: 'fixture-groq' });
    let finish!: (response: unknown) => void;
    const started = new Promise<void>(resolve => fetch.mockImplementation(() => {
      resolve(); return new Promise(resolver => { finish = resolver; });
    }));
    const provider = send({ type: 'HEARD', text: 'hey handsfree select this' });
    await started;
    await send({ type: 'ACTION', intent: { type: 'start-typing' } });
    finish({ ok: true, json: async () => ({ choices: [{ message: { content: '{"ids":[],"intent":{"type":"click"}}' } }] }) });
    await provider;
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(browser.tabs.sendMessage).not.toHaveBeenCalledWith(1, { type: 'PAGE_ACTION', intent: { type: 'click' } });
  });
  it('rechecks cancellation after tab permission resolves', async () => {
    const { browser, send, fetch } = await setup({ key: 'fixture-groq' });
    let allow!: (value: boolean) => void;
    const waiting = new Promise<void>(resolve => browser.permissions.contains.mockImplementation(() => {
      resolve(); return new Promise(resolver => { allow = resolver; });
    }));
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"ids":[],"intent":{"type":"new-tab"}}' } }] }) });
    const provider = send({ type: 'HEARD', text: 'hey handsfree open a fresh tab' });
    await waiting;
    await send({ type: 'PAUSE' });
    allow(true);
    await provider;
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(browser.tabs.create).not.toHaveBeenCalled();
  });
});

describe('local tab switching', () => {
  it('switches next, previous and named tabs with Jev offline', async () => {
    const { browser, send, fetch } = await setup({ jevKey: 'fixture-jev' });
    fetch.mockRejectedValue(new Error('offline'));
    await send({ type: 'HEARD', text: 'switch to the next tab' });
    expect((await send({ type: 'GET_STATE' })).targetTabId).toBe(2);
    await send({ type: 'HEARD', text: 'switch to previous tab' });
    expect((await send({ type: 'GET_STATE' })).targetTabId).toBe(1);
    await send({ type: 'HEARD', text: 'switch to tab Inbox' });
    expect((await send({ type: 'GET_STATE' })).targetTabId).toBe(2);
    expect(browser.tabs.update).toHaveBeenCalledWith(2, { active: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lists tabs in the controlled window and activates any tab by its spoken number', async () => {
    const { browser, send } = await setup();
    browser.tabs.query.mockResolvedValue([
      { id: 1, windowId: 1, index: 0, url: 'https://example.test/', title: 'Project notes' },
      { id: 2, windowId: 1, index: 1, url: 'https://example.test/inbox', title: 'Inbox' },
      { id: 3, windowId: 1, index: 2, url: 'https://example.test/settings', title: 'Settings' },
      { id: 4, windowId: 2, index: 0, url: 'https://other.test/', title: 'Other window' },
    ]);

    await send({ type: 'HEARD', text: 'show tabs' });
    expect((await send({ type: 'GET_STATE' })).feedback).toContain('1. Project notes; 2. Inbox; 3. Settings');
    expect((await send({ type: 'GET_STATE' })).feedback).not.toContain('Other window');

    await send({ type: 'HEARD', text: 'go to tab three' });
    expect(browser.tabs.update).toHaveBeenCalledWith(3, { active: true });
    expect((await send({ type: 'GET_STATE' })).targetTabId).toBe(3);
  });
});

describe('deferred browser-read cancellation', () => {
  it.each([
    { intent: { type: 'next-tab' }, interrupt: 'PAUSE' },
    { intent: { type: 'named-tab', name: 'Inbox' }, interrupt: 'cancel' },
    { intent: { type: 'choose', index: 2 }, interrupt: 'STOP' },
  ] as const)('does not activate a stale $intent.type after delayed tabs.get', async ({ intent, interrupt }) => {
    const { browser, send, fetch } = await setup({ key: 'fixture-groq' });
    if (intent.type === 'choose') {
      browser.tabs.query.mockResolvedValue([
        { id: 1, windowId: 1, index: 0, url: 'https://example.test/', title: 'Inbox' },
        { id: 2, windowId: 1, index: 1, url: 'https://example.test/inbox', title: 'Inbox' },
      ]);
      await send({ type: 'HEARD', text: 'switch to tab Inbox' });
    }
    const original = browser.tabs.get.getMockImplementation()!;
    let release!: () => void;
    const waiting = new Promise<void>(resolve => browser.tabs.get.mockImplementation(id => {
      resolve(); return new Promise(resolver => { release = () => { void original(id).then(resolver); }; });
    }));
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ ids: [], intent }) } }] }) });
    const provider = send({ type: 'HEARD', text: 'hey handsfree switch to my requested tab' });
    await waiting;
    await send(interrupt === 'cancel' ? { type: 'HEARD', text: 'cancel' } : { type: interrupt });
    release();
    await provider;
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(browser.tabs.update).not.toHaveBeenCalled();
    expect(browser.windows.update).not.toHaveBeenCalled();
    expect((await send({ type: 'GET_STATE' })).targetTabId).toBe(1);
  });
  it('does not create incognito after authorization resolves for a cancelled provider action', async () => {
    const { browser, send, fetch } = await setup({ key: 'fixture-groq' });
    let release!: (allowed: boolean) => void;
    const waiting = new Promise<void>(resolve => browser.extension.isAllowedIncognitoAccess.mockImplementation(() => {
      resolve(); return new Promise(resolver => { release = resolver; });
    }));
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"ids":[],"intent":{"type":"incognito"}}' } }] }) });
    const provider = send({ type: 'HEARD', text: 'hey handsfree open a private window' });
    await waiting;
    await send({ type: 'HEARD', text: 'click this' });
    release(true);
    await provider;
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(browser.windows.create).not.toHaveBeenCalled();
  });
});

describe('tab activation transition validity', () => {
  it('does not focus a window after pause while tab activation is outstanding', async () => {
    const { browser, send, fetch } = await setup({ key: 'fixture-groq' });
    let release!: () => void;
    const waiting = new Promise<void>(resolve => browser.tabs.update.mockImplementation(() => {
      resolve(); return new Promise(resolver => { release = () => resolver({}); });
    }));
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"ids":[],"intent":{"type":"next-tab"}}' } }] }) });
    const provider = send({ type: 'HEARD', text: 'hey handsfree switch tabs' });
    await waiting;
    await send({ type: 'PAUSE' });
    release();
    await provider;
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(browser.windows.update).not.toHaveBeenCalled();
    expect((await send({ type: 'GET_STATE' })).targetTabId).toBe(1);
  });
  it('finishes a valid provider switch when Chrome emits its own activation event', async () => {
    const { browser, send, fetch } = await setup({ key: 'fixture-groq' });
    const activated = browser.tabs.onActivated.addListener.mock.calls[0][0] as (info: { tabId: number }) => void;
    browser.tabs.update.mockImplementation(async id => {
      activated({ tabId: id });
      for (let i = 0; i < 20; i++) await Promise.resolve();
      return {};
    });
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"ids":[],"intent":{"type":"next-tab"}}' } }] }) });
    await send({ type: 'HEARD', text: 'hey handsfree switch tabs' });
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(browser.windows.update).toHaveBeenCalledWith(1, { focused: true });
    expect(await send({ type: 'GET_STATE' })).toMatchObject({ targetTabId: 2, feedback: 'Switched tab.' });
  });
});

describe('user tab activation supersedes controlled switching', () => {
  it('keeps the original tab after the user returns during deferred window focus', async () => {
    const { browser, send, fetch } = await setup({ key: 'fixture-groq' });
    const activated = browser.tabs.onActivated.addListener.mock.calls[0][0] as (info: { tabId: number }) => void;
    browser.tabs.update.mockImplementation(async id => {
      activated({ tabId: id });
      for (let i = 0; i < 20; i++) await Promise.resolve();
      return {};
    });
    let releaseFocus!: () => void;
    const focusing = new Promise<void>(resolve => browser.windows.update.mockImplementation(() => {
      resolve(); return new Promise(resolver => { releaseFocus = () => resolver({}); });
    }));
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"ids":[],"intent":{"type":"next-tab"}}' } }] }) });
    const provider = send({ type: 'HEARD', text: 'hey handsfree switch tabs' });
    await focusing;
    // B's own activation echo has already been emitted. Selecting A is a real
    // competing user action even though A remains the session's current target.
    activated({ tabId: 1 });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    releaseFocus();
    await provider;
    for (let i = 0; i < 30; i++) await Promise.resolve();
    const state = await send({ type: 'GET_STATE' });
    expect(state.targetTabId).toBe(1);
    expect(state.feedback).not.toBe('Switched tab.');
    expect(browser.tabs.sendMessage.mock.calls.some(([id, message]) => id === 2 && message.type === 'PAGE_STATE')).toBe(false);
  });
});

describe("comfortable control settings", () => {
  it("normalizes invalid persisted settings and fills old missing fields", async () => {
    const { send } = await setup({ settings: { sensitivity: "invalid", dwellMs: Infinity, scrollSensitivity: -100, cursorStyle: "unknown", edgeScroll: "false", dwellEnabled: null } });
    expect(await send({ type: "GET_SETTINGS" })).toMatchObject({ sensitivity: 1, dwellMs: 800, scrollSensitivity: 0.2, cursorStyle: "circle", edgeScroll: true, dwellEnabled: true });
  });
  it("persists expanded upper bounds and valid cursor styles", async () => {
    const { send, browser } = await setup();
    await send({ type: "SAVE_SETTINGS", settings: { ...defaults, sensitivity: 6, dwellMs: 5000, scrollSensitivity: 3, cursorStyle: "crosshair" } });
    expect(await send({ type: "GET_SETTINGS" })).toMatchObject({ sensitivity: 6, dwellMs: 5000, scrollSensitivity: 3, cursorStyle: "crosshair" });
    expect(browser.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ settings: expect.objectContaining({ scrollSensitivity: 3, cursorStyle: "crosshair" }) }));
    await send({ type: "SAVE_SETTINGS", settings: { ...defaults, sensitivity: 0.2, dwellMs: 400, scrollSensitivity: 0.2, cursorStyle: "spark" } });
    expect(await send({ type: "GET_SETTINGS" })).toMatchObject({ sensitivity: 0.2, dwellMs: 400, scrollSensitivity: 0.2, cursorStyle: "spark" });
  });
  it("clamps finite outliers and rejects nonfinite settings on save", async () => {
    const { send } = await setup();
    await send({ type: "SAVE_SETTINGS", settings: { ...defaults, sensitivity: 100, dwellMs: -1, scrollSensitivity: NaN, cursorStyle: "bad" } as unknown as typeof defaults });
    expect(await send({ type: "GET_SETTINGS" })).toMatchObject({ sensitivity: 6, dwellMs: 400, scrollSensitivity: 1, cursorStyle: "circle" });
  });
});


describe("legacy preference migration and wake named clicks", () => {
  it("fills genuinely absent fields in an old stored settings record", async () => {
    const { send, browser } = await setup({ legacySettings: { pointerMode: "hand", sensitivity: 2.5, dwellMs: 1200 } });
    const raw = await browser.storage.local.get();
    expect(Object.hasOwn(raw.settings, "cursorStyle")).toBe(false);
    expect(Object.hasOwn(raw.settings, "scrollSensitivity")).toBe(false);
    expect(await send({ type: "GET_SETTINGS" })).toMatchObject({ pointerMode: "hand", sensitivity: 2.5, dwellMs: 1200, cursorStyle: "circle", scrollSensitivity: 1 });
  });
  it("routes an explicit wake named click through local page matching, and keeps finds as highlights", async () => {
    const { browser, send, fetch } = await setup({ key: "fixture-groq" });
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ ids: [], intent: { type: "click-target", query: "Careers" } }) } }] }) });
    await send({ type: "HEARD", text: "hey handsfree open Careers" });
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, { type: "PAGE_ACTION", intent: { type: "click-target", query: "Careers" } });
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"ids":["careers"]}' } }] }) });
    browser.tabs.sendMessage.mockClear();
    await send({ type: "HEARD", text: "hey handsfree find Careers" });
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, { type: "FIND_RESULT", ids: ["careers"] });
    expect(browser.tabs.sendMessage.mock.calls.some(([,m]) => m.type === "PAGE_ACTION")).toBe(false);
  });
});

it("keeps bare pause and cancel literal during dictation, reserving addressed session controls",async()=>{
 const {browser,send}=await setup();await send({type:"HEARD",text:"start typing"});
 await send({type:"HEARD",text:"pause"});await send({type:"HEARD",text:"cancel"});
 expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1,{type:"DICTATE",text:"pause"});expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1,{type:"DICTATE",text:"cancel"});
 expect((await send({type:"GET_STATE"})).paused).toBe(false);await send({type:"HEARD",text:"pause handsfree"});expect((await send({type:"GET_STATE"})).paused).toBe(true);
});
describe("trusted selected-link tab authorization", () => {
  async function selected(url = "https://example.test/second", valid = true) {
    const env = await setup();
    const original = env.browser.tabs.sendMessage.getMockImplementation()!;
    env.browser.tabs.sendMessage.mockImplementation(async (id, message) => {
      if (message.type === "PAGE_ACTION" && message.intent.type === "click-link") return { ok: true, link: { id: "link-2", url, pageUrl: "https://example.test/" } };
      if (message.type === "VALIDATE_LINK") return { ok: valid };
      return original(id, message);
    });
    return env;
  }
  it("opens a revalidated selected link in background without retargeting", async () => {
    const { browser, send } = await selected();
    await send({ type: "HEARD", text: "open the second result in a background tab" });
    expect(browser.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: "https://example.test/second", active: false });
    expect((await send({ type: "GET_STATE" })).targetTabId).toBe(1);
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, { type: "VALIDATE_LINK", id: "link-2", url: "https://example.test/second", pageUrl: "https://example.test/" });
  });
  it.each(["javascript:alert(1)", "data:text/html,bad", "chrome://settings", "file:///tmp/test", "https://user:pass@example.test/"])("rejects unsafe selected URL %s", async url => {
    const { browser, send } = await selected(url);
    await send({ type: "HEARD", text: "open first link in a new tab" });
    expect(browser.tabs.create).not.toHaveBeenCalled();
  });
  it("does not open when content invalidates the selected destination", async () => {
    const { browser, send } = await selected(undefined, false);
    await send({ type: "HEARD", text: "open first link in a new tab" });
    expect(browser.tabs.create).not.toHaveBeenCalled();
  });
  it("cancels tab opening if navigation occurs during revalidation", async () => {
    const { browser, send } = await selected();
    let release!: (value: any) => void;
    const original = browser.tabs.sendMessage.getMockImplementation()!;
    browser.tabs.sendMessage.mockImplementation(async (id, message) => message.type === "VALIDATE_LINK" ? new Promise(resolve => { release = resolve; }) : original(id, message));
    const pending = send({ type: "HEARD", text: "open first link in a new tab" });
    for (let i = 0; i < 100 && !release; i++) await Promise.resolve();
    expect(release).toBeTypeOf("function");
    const update = browser.tabs.onUpdated.addListener.mock.calls[0][0] as any;
    await update(1, { status: "loading", url: "https://example.test/new" });
    release({ ok: true }); await pending;
    expect(browser.tabs.create).not.toHaveBeenCalled();
  });
  it.each(["ACTION", "HEARD"] as const)("cancels authorization when %s cancel arrives during revalidation", async source => {
    const { browser, send } = await selected();
    let release!: (value: any) => void;
    const original = browser.tabs.sendMessage.getMockImplementation()!;
    browser.tabs.sendMessage.mockImplementation(async (id, message) => message.type === "VALIDATE_LINK" ? new Promise(resolve => { release = resolve; }) : original(id, message));
    const pending = send({ type: "HEARD", text: "open first link in a new tab" });
    for (let i = 0; i < 100 && !release; i++) await Promise.resolve();
    expect(release).toBeTypeOf("function");
    const cancelling = send(source === "ACTION" ? { type: "ACTION", intent: { type: "cancel" } } : { type: "HEARD", text: "cancel" });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    release({ ok: true }); await pending; await cancelling;
    expect(browser.tabs.create).not.toHaveBeenCalled();
  });
  it("rejects page-initiated navigation intents and exposes counts only", async () => {
    const { browser, send } = await selected();
    expect(await send({ type: "ACTION", intent: { type: "click-link", index: 1, disposition: "background" } }, pageSender(1))).toMatchObject({ ok: false });
    expect(browser.tabs.create).not.toHaveBeenCalled();
    await send({ type: "SAVE_PROVIDERS", jevKey: "dummy-old", jevKeys: ["dummy-old", "dummy-new"] });
    const status = await send({ type: "GET_PROVIDER_STATUS" });
    expect(status.jevKeyCount).toBe(2);
    expect(JSON.stringify(status)).not.toContain("dummy");
    await send({ type: "SAVE_PROVIDERS", jevKey: "dummy-third" });
    expect((await send({ type: "GET_PROVIDER_STATUS" })).jevKeyCount).toBe(3);
    await send({ type: "SAVE_PROVIDERS", jevKey: "" });
    expect((await send({ type: "GET_PROVIDER_STATUS" })).jevKeyCount).toBe(0);
  });
});
