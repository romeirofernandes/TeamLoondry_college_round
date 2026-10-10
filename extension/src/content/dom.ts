import type { TargetText } from "../shared";

export const interactiveSelector =
  'a[href],button,input:not([type="hidden"]),textarea,select,[contenteditable="true"],[contenteditable=""],[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[tabindex]:not([tabindex="-1"])';
export const overlayId = "handsfree-assist-overlay";

export function usable(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement) || element.closest(`#${overlayId}`))
    return false;
  if (
    element.closest('[hidden],[inert],[aria-hidden="true"]') ||
    element.matches(':disabled,[aria-disabled="true"]')
  )
    return false;
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.visibility !== "collapse" &&
    Number(style.opacity || "1") > 0 &&
    box.width > 0 &&
    box.height > 0
  );
}

export function targetLabel(element: HTMLElement): string {
  const labelIds = element.getAttribute("aria-labelledby")?.split(/\s+/) ?? [];
  const labelled = labelIds
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
  const labels =
    "labels" in element
      ? Array.from((element as HTMLInputElement).labels ?? [])
          .map((label) => label.textContent)
          .join(" ")
      : "";
  const text =
    element instanceof HTMLInputElement
      ? element.type === "submit" || element.type === "button"
        ? element.value
        : ""
      : element.textContent;
  return (
    element.getAttribute("aria-label") ||
    labelled ||
    labels ||
    text ||
    element.getAttribute("title") ||
    element.getAttribute("placeholder") ||
    element.getAttribute("name") ||
    element.tagName.toLowerCase()
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function sensitive(element: HTMLElement): boolean {
  const descriptor = [
    element.getAttribute("type"),
    element.getAttribute("autocomplete"),
    element.getAttribute("name"),
    element.id,
    element.getAttribute("aria-label"),
  ].join(" ");
  return /password|passwd|credit|debit|payment|card.?number|card.?holder|card.?expiry|cvv|cvc|cc-|one-time-code/i.test(
    descriptor,
  );
}

export function editable(element: HTMLElement | null): boolean {
  if (
    !element ||
    !usable(element) ||
    sensitive(element) ||
    element.matches('[readonly],[aria-readonly="true"]')
  )
    return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement)
    return ["text", "search", "email", "tel", "url"].includes(element.type);
  return (
    element.isContentEditable ||
    element.getAttribute("contenteditable") === "true" ||
    element.getAttribute("contenteditable") === ""
  );
}

export function submitControl(element: HTMLElement): boolean {
  return (
    (element instanceof HTMLButtonElement &&
      element.type === "submit" &&
      !!element.form) ||
    (element instanceof HTMLInputElement &&
      ["submit", "image"].includes(element.type) &&
      !!element.form)
  );
}

export function formFor(element: HTMLElement | null): HTMLFormElement | null {
  if (!element) return null;
  return (
    ("form" in element ? (element as HTMLInputElement).form : null) ||
    element.closest("form")
  );
}

export function insertText(element: HTMLElement, text: string): boolean {
  if (!editable(element)) return false;
  element.focus({ preventScroll: true });
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const current = element.value;
    const start = element.selectionStart ?? current.length;
    const end = element.selectionEnd ?? start;
    const previous = current.slice(0, start);
    const prefix =
      previous && !/\s$/.test(previous) && text && !/^[\s.,!?;:]/.test(text)
        ? " "
        : "";
    const value = previous + prefix + text + current.slice(end);
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
      element,
      value,
    );
    const caret = start + prefix.length + text.length;
    try {
      element.setSelectionRange(caret, caret);
    } catch {
      /* Email fields do not expose selection ranges. */
    }
  } else {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (range && element.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else {
      const previous = element.textContent ?? "";
      element.append(
        document.createTextNode(
          (previous && !/\s$/.test(previous) ? " " : "") + text,
        ),
      );
    }
  }
  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType: "insertText",
      data: text,
    }),
  );
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

export class PageTargets {
  private ids = new WeakMap<HTMLElement, string>();
  private elements = new Map<string, HTMLElement>();
  private sequence = 0;
  private candidates: Element[] = [];
  private refreshedAt = -Infinity;
  id(element: HTMLElement): string {
    let id = this.ids.get(element);
    if (!id) {
      id = `hf-${++this.sequence}`;
      this.ids.set(element, id);
    }
    this.elements.set(id, element);
    return id;
  }
  get(id: string): HTMLElement | null {
    const element = this.elements.get(id);
    return element && element.isConnected && usable(element) ? element : null;
  }
  scan(): TargetText[] {
    this.elements.clear();
    return Array.from(document.querySelectorAll(interactiveSelector))
      .filter(usable)
      .slice(0, 1500)
      .map((element) => ({
        id: this.id(element),
        text: targetLabel(element),
        role: element.getAttribute("role") || element.tagName.toLowerCase(),
      }));
  }
  snap(x: number, y: number): HTMLElement | null {
    const direct = document
      .elementFromPoint(x, y)
      ?.closest(interactiveSelector);
    if (direct && usable(direct)) return direct;
    let winner: HTMLElement | null = null;
    let distance = 42;
    if (performance.now() - this.refreshedAt > 250) {
      this.candidates = Array.from(
        document.querySelectorAll(interactiveSelector),
      );
      this.refreshedAt = performance.now();
    }
    for (const candidate of this.candidates) {
      if (!candidate.isConnected) continue;
      const box = candidate.getBoundingClientRect();
      if (
        box.bottom < 0 ||
        box.top > innerHeight ||
        box.right < 0 ||
        box.left > innerWidth
      )
        continue;
      const dx = Math.max(box.left - x, 0, x - box.right);
      const dy = Math.max(box.top - y, 0, y - box.bottom);
      const gap = Math.hypot(dx, dy);
      if (gap < distance && usable(candidate)) {
        winner = candidate;
        distance = gap;
      }
    }
    return winner;
  }
}
