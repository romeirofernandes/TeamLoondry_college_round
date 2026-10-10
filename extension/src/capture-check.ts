/** A permission-check lease ends on completion or when its UI closes. */
export async function captureCheck(): Promise<() => Promise<void>> {
  const port = chrome.runtime.connect({ name: "handsfree-capture-check" });
  let ready = false, disconnected = false;
  let finishRelease: (() => void) | null = null;
  const finish = () => { const callback = finishRelease; finishRelease = null; callback?.(); };
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { port.disconnect(); reject(new Error("Desktop handoff timed out. Capture stayed off.")); }, 10000);
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      disconnected = true;
      clearTimeout(timer);
      if (!ready) reject(new Error("Capture preparation disconnected."));
      finish();
    });
    port.onMessage.addListener(message => {
      if (message.released) { finish(); return; }
      clearTimeout(timer);
      if (message.ok) { ready = true; resolve(); }
      else { port.disconnect(); reject(new Error(message.error || "Desktop handoff failed. Capture stayed off.")); }
    });
  });
  let release: Promise<void> | null = null;
  return () => release ??= new Promise<void>(resolve => {
    if (disconnected) { resolve(); return; }
    const timer = setTimeout(() => finish(), 10000);
    finishRelease = () => { clearTimeout(timer); port.disconnect(); resolve(); };
    try { port.postMessage({ release: true }); } catch { finish(); }
  });
}
