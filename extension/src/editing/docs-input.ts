import { docsSnapshot } from "./google-docs";
/** Trusted native text events for the current editable Google Docs body only. */
export async function docsInput(
  tabId: number,
  command: "insert" | "scratch" | "restore",
  text: string,
  expected: string,
  url: string,
  current: () => boolean,
) {
  if (!current()) throw new Error("The writing task changed.");
  const tab = await chrome.tabs.get(tabId);
  const parsed = new URL(tab.url || "");
  if (
    parsed.hostname !== "docs.google.com" ||
    !/^\/document\/d\//.test(parsed.pathname) ||
    tab.url !== url ||
    !tab.active
  )
    throw new Error("Return to the same Google Docs document.");
  if (!(await chrome.permissions.contains({ permissions: ["debugger"] })))
    throw new Error(
      "Reload the updated extension to grant Google Docs input access, then retry.",
    );
  const target = { tabId };
  let attached = false;
  const snapshot = async () => {
    const rows = await chrome.scripting.executeScript({
      target: { tabId },
      func: docsSnapshot,
    });
    return rows[0]?.result;
  };
  try {
    const before = await snapshot();
    if (
      !current() ||
      !before?.editable ||
      !before.focused ||
      before.text !== expected
    )
      throw new Error("Google Docs focus or text changed. Nothing edited.");
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    if (!current()) throw new Error("Writing cancelled.");
    if (command === "insert") {
      // Chrome insertText sends a single trusted Unicode insertion to the Docs iframe.
      if (text === "\n") {
        await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
        });
        await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
        });
      } else
        await chrome.debugger.sendCommand(target, "Input.insertText", { text });
    } else {
      const platform = await chrome.runtime.getPlatformInfo();
      const modifiers = platform.os === "mac" ? 4 : 2;
      const shift = command === "restore" ? 8 : 0;
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "z",
        code: "KeyZ",
        windowsVirtualKeyCode: 90,
        modifiers: modifiers | shift,
      });
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "z",
        code: "KeyZ",
        windowsVirtualKeyCode: 90,
        modifiers: modifiers | shift,
      });
    }
    let signature = "",
      stable = 0;
    for (let i = 0; i < 24; i++) {
      if (!current())
        throw new Error(
          "The writing task changed after input. Check your draft.",
        );
      const after = await snapshot();
      if (after && (after.text !== expected || after.caret !== before.caret)) {
        const next = after.text + "|" + after.caret;
        stable = next === signature ? stable + 1 : 1;
        signature = next;
        if (stable >= 3) return { ok: true };
      } else stable = 0;
      await new Promise((resolve) => setTimeout(resolve, 125));
    }
    throw new Error(
      "Google Docs did not verify the edit. Check the document before retrying.",
    );
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => {});
  }
}
