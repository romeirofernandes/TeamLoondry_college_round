import type { Message, SessionState } from "../../extension/src/shared";

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
const pending = new Map<string, Pending>();
const subscribers = new Set<(state: SessionState) => void>();
const readySubscribers = new Set<() => void>();
const voiceSubscribers = new Set<(text: string) => void>();
let listening = false;
function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.channel === "handsfree-dashboard-ready") {
      for (const callback of readySubscribers) callback();
    }
    if (event.data?.channel === "handsfree-dashboard-state") {
      for (const callback of subscribers) callback(event.data.state);
    }
    if (event.data?.channel === "handsfree-dashboard-heard" && typeof event.data.text === "string") {
      for (const callback of voiceSubscribers) callback(event.data.text);
    }
    if (event.data?.channel === "handsfree-dashboard-response") {
      const entry = pending.get(event.data.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(event.data.id);
      const result = event.data.result;
      if (result?.ok === false) entry.reject(new Error(result.error || "Action failed. Retry from the popup."));
      else entry.resolve(result);
    }
  });
}
export function subscribeVoice(callback: (text: string) => void) {
  listen(); voiceSubscribers.add(callback);
  return () => { voiceSubscribers.delete(callback); };
}
export function request<T = unknown>(message: Message): Promise<T> {
  listen();
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Open this dashboard from the Handsfree popup to connect the extension."));
    }, message.type === "HEARD" || message.type === "UI_SPEAK" ? 25000 : 8000);
    pending.set(id, { resolve: value => resolve(value as T), reject, timer });
    window.postMessage({ channel: "handsfree-dashboard-request", id, message }, location.origin);
  });
}
export function subscribe(callback: (state: SessionState) => void) {
  listen();
  subscribers.add(callback);
  return () => { subscribers.delete(callback); };
}

export function subscribeReady(callback: () => void) {
  listen();
  readySubscribers.add(callback);
  return () => { readySubscribers.delete(callback); };
}
