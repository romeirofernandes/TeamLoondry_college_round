// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

const bridgeWindow = window as Window & { __handsfreeBridge?: boolean };
afterEach(() => {
  delete bridgeWindow.__handsfreeBridge;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function bridge(sendMessage: ReturnType<typeof vi.fn>) {
  vi.resetModules();
  const listen = vi.fn();
  const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
  vi.stubGlobal("addEventListener", listen);
  vi.stubGlobal("chrome", { runtime: { sendMessage, onMessage: { addListener: vi.fn() } } });
  await import("../src/dashboard-bridge");
  const request = listen.mock.calls[0][1] as (event: MessageEvent) => void;
  post.mockClear();
  return { post, request, event: {
    source: window, origin: location.origin,
    data: { channel: "handsfree-dashboard-request", id: "request-1", message: { type: "GET_STATE" } },
  } as unknown as MessageEvent };
}

it("handles a synchronous invalidated context without an uncaught error", async () => {
  const { post, request, event } = await bridge(vi.fn(() => { throw new Error("Extension context invalidated."); }));
  expect(() => request(event)).not.toThrow();
  await vi.waitFor(() => expect(post).toHaveBeenCalledWith({
    channel: "handsfree-dashboard-response", id: "request-1",
    result: { ok: false, error: expect.stringMatching(/refresh|reload/i) },
  }, location.origin));
});

it("returns a recovery response when runtime messaging rejects", async () => {
  const { post, request, event } = await bridge(vi.fn().mockRejectedValue(new Error("Receiving end does not exist")));
  request(event);
  await vi.waitFor(() => expect(post).toHaveBeenCalledWith({
    channel: "handsfree-dashboard-response", id: "request-1",
    result: { ok: false, error: expect.stringMatching(/refresh|reload/i) },
  }, location.origin));
});

it("forwards successful responses with the original request ID", async () => {
  const result = { running: false };
  const send = vi.fn().mockResolvedValue(result);
  const { post, request, event } = await bridge(send);
  request(event);
  await vi.waitFor(() => expect(post).toHaveBeenCalledWith({ channel: "handsfree-dashboard-response", id: "request-1", result }, location.origin));
  expect(send).toHaveBeenCalledWith({ type: "GET_STATE" });
});

it("ignores requests from another origin or window", async () => {
  const send = vi.fn().mockResolvedValue({});
  const { post, request, event } = await bridge(send);
  request({ ...event, origin: "https://other.example" } as MessageEvent);
  request({ ...event, source: null } as MessageEvent);
  expect(send).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
});
