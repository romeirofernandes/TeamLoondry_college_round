// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("reflects denied, granted and externally revoked permissions instead of the clicked checkbox state", async () => {
  vi.resetModules();
  document.body.innerHTML = '<main id="permissions"></main>';
  let pages = false, grant = false;
  let added!: () => void, removed!: () => void;
  const devices = { camera: { state: "granted", addEventListener: vi.fn() }, microphone: { state: "denied", addEventListener: vi.fn() } };
  vi.stubGlobal("navigator", { permissions: { query: vi.fn(async ({ name }: { name: "camera" | "microphone" }) => devices[name]) } });
  vi.stubGlobal("chrome", {
    runtime: { sendMessage: vi.fn(async (message: { type: string }) => message.type === "GET_PERMISSIONS" ? { pages, tabs: false, provider: true } : { ok: true }) },
    permissions: {
      request: vi.fn(async () => { pages = grant; return grant; }),
      remove: vi.fn(async () => { pages = false; return true; }),
      onAdded: { addListener: (callback: () => void) => { added = callback; } },
      onRemoved: { addListener: (callback: () => void) => { removed = callback; } },
    },
  });
  await import("../src/permissions"); await flush();
  const toggle = document.querySelector<HTMLInputElement>("#pages")!;
  toggle.click(); await flush();
  expect(toggle.checked).toBe(false);
  expect(document.querySelector<HTMLButtonElement>("#camera")!.hidden).toBe(true);
  expect(document.querySelector("#camera-state")!.textContent).toBe("Allowed");
  expect(document.querySelector("#microphone-state")!.textContent).toContain("Blocked");
  grant = true; toggle.click(); await flush();
  expect(toggle.checked).toBe(true);
  pages = false; removed(); await flush();
  expect(toggle.checked).toBe(false);
  pages = true; added(); await flush();
  expect(toggle.checked).toBe(true);
  toggle.click(); await flush();
  expect(toggle.checked).toBe(false);
});
it("requests only a selected microphone and releases the permission-check stream", async () => {
  vi.resetModules(); document.body.innerHTML = '<div id="permissions"></div>';
  vi.stubGlobal("location", {search:"?kind=devices&camera=false&microphone=true&return=%23setup"});
  const stop = vi.fn(); const getUserMedia = vi.fn(async () => ({getTracks:()=>[{stop}]}));
  vi.stubGlobal("navigator", {mediaDevices:{getUserMedia},permissions:{query:vi.fn(async()=>({state:"prompt",addEventListener:vi.fn()}))}});
  vi.stubGlobal("chrome",{runtime:{sendMessage:vi.fn(async(message)=>message.type==="PREPARE_BROWSER_CAPTURE"?{ok:true}:{pages:false,tabs:false,provider:false})},permissions:{onAdded:{addListener:vi.fn()},onRemoved:{addListener:vi.fn()}}});
  await import("../src/permissions");await flush();
  expect(document.querySelector<HTMLElement>('[data-kind="camera"]')!.hidden).toBe(true);
  expect(document.querySelector<HTMLElement>('[data-kind="microphone"]')!.hidden).toBe(false);
  expect(getUserMedia).not.toHaveBeenCalled();
  document.querySelector<HTMLButtonElement>("#microphone")!.click();await flush();
  expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({audio:true});expect(stop).toHaveBeenCalledOnce();
});
