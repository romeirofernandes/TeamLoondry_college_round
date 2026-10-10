import type { PageContext, TargetText } from "../shared";

export const interactiveSelector =
  'a[href],button,input:not([type="hidden"]),textarea,select,[contenteditable="true"],[contenteditable=""],[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[tabindex]:not([tabindex="-1"])';
export const overlayId = "handsfree-assist-overlay";
const privateTextSelector =
  'input,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"],script,style,noscript,template,[data-private],[data-handsfree-ignore],#handsfree-assist-overlay';

function publicText(element: Element): boolean {
  if (element.closest(privateTextSelector + ',[hidden],[inert],[aria-hidden="true"]')) return false;
  for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity || "1") <= 0) return false;
    if (ancestor instanceof HTMLElement && sensitive(ancestor)) return false;
  }
  return true;
}

function staticText(element: Element | null): string {
  if (!element || element.closest(privateTextSelector)) return "";
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const pieces: string[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.parentElement && publicText(node.parentElement))
      pieces.push(node.textContent ?? "");
  }
  return pieces.join(" ");
}

/** Public rendered document text only; never read form values or editable content. */
export function pageContext(): PageContext {
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  let text = "";
  let node: Node | null;
  while (text.length < 12000 && (node = walker.nextNode())) {
    if (!node.parentElement || !publicText(node.parentElement)) continue;
    const piece = (node.textContent || "").replace(/\s+/g, " ").trim();
    if (piece) text += (text ? " " : "") + piece.slice(0, 12000 - text.length - (text ? 1 : 0));
  }
  return { title: document.title.slice(0, 500), url: location.href.slice(0, 2000), text };
}

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
  if (style.pointerEvents === "none" || box.width <= 0 || box.height <= 0)
    return false;
  // Opacity and display on an ancestor hide children even when their own styles look visible.
  for (
    let ancestor: Element | null = element;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    const ancestorStyle =
      ancestor === element ? style : getComputedStyle(ancestor);
    if (
      ancestorStyle.display === "none" ||
      ancestorStyle.visibility === "hidden" ||
      ancestorStyle.visibility === "collapse" ||
      Number(ancestorStyle.opacity || "1") <= 0
    )
      return false;
  }
  return true;
}

export function targetLabel(element: HTMLElement): string {
  const labelIds = element.getAttribute("aria-labelledby")?.split(/\s+/) ?? [];
  const labelled = labelIds
    .map((id) => staticText(document.getElementById(id)))
    .join(" ");
  const labels =
    "labels" in element
      ? Array.from((element as HTMLInputElement).labels ?? [])
          .map((label) => staticText(label))
          .join(" ")
      : "";
  // Editable text is user data, never a label sent to arbitrary-find ranking.
  const isEditableContent =
    element instanceof HTMLTextAreaElement ||
    element.isContentEditable ||
    element.closest('[contenteditable="true"],[contenteditable=""]') !== null ||
    element.getAttribute("role") === "textbox";
  const text =
    element instanceof HTMLInputElement
      ? element.type === "submit" || element.type === "button"
        ? element.value
        : ""
      : isEditableContent
        ? ""
        : staticText(element);
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
  private visible = new Set<Element>();
  private intersection: IntersectionObserver | null = null;
  private mutations: MutationObserver | null = null;
  private dirty = true;
  constructor() {
    if (typeof IntersectionObserver !== "undefined") {
      this.intersection = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) this.visible.add(entry.target);
          else this.visible.delete(entry.target);
        }
      }, { rootMargin: "48px" });
      this.mutations = new MutationObserver(records => {
        if (records.some(record => !(record.target instanceof Element && record.target.closest(`#${overlayId}`)))) this.dirty = true;
      });
      this.mutations.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["role", "tabindex", "href", "type", "contenteditable"] });
    }
  }
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
      .filter(element => !sensitive(element) && !element.closest('[data-private],[data-handsfree-ignore]'))
      .slice(0, 1500)
      .map((element) => ({
        id: this.id(element),
        text: targetLabel(element),
        role: element.getAttribute("role") || element.tagName.toLowerCase(),
      }));
  }
  named(query: string): string[] {
    const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
    const needle = normalize(query);
    if (!needle || needle.length > 500) return [];
    const ranked = this.scan().map(target => {
      const label = normalize(target.text);
      const offset = label.indexOf(needle);
      if (offset < 0) return { id: target.id, score: 0 };
      const word = (character: string | undefined) => !!character && /[\p{L}\p{N}_]/u.test(character);
      let whole = false;
      for (let match = offset; match >= 0; match = label.indexOf(needle, match + 1)) {
        if (!word(label[match - 1]) && !word(label[match + needle.length])) {
          whole = true;
          break;
        }
      }
      return { id: target.id, score: label === needle ? 3 : whole ? 2 : 1 };
    });
    const best = Math.max(0, ...ranked.map(target => target.score));
    return best ? ranked.filter(target => target.score === best).map(target => target.id).slice(0, 10) : [];
  }
  snap(x: number, y: number): HTMLElement | null {
    const direct = document
      .elementFromPoint(x, y)
      ?.closest(interactiveSelector);
    if (direct && usable(direct)) return direct;
    let winner: HTMLElement | null = null;
    let distance = 42;
    if ((this.intersection ? this.dirty : true) && performance.now() - this.refreshedAt > 250) {
      this.candidates = Array.from(
        document.querySelectorAll(interactiveSelector),
      ).filter(element => !element.closest(`#${overlayId}`));
      this.refreshedAt = performance.now();
      this.dirty = false;
      if (this.intersection) {
        this.intersection.disconnect();
        this.visible.clear();
        for (const candidate of this.candidates) this.intersection.observe(candidate);
      }
    }
    // Hit-test a small neighborhood until the intersection index has delivered
    // its first entries. Pointer updates never walk thousands of offscreen boxes.
    const nearby = new Set(this.visible);
    if (this.intersection) {
      for (const radius of [14, 28, 42]) {
        for (let index = 0; index < 8; index++) {
          const angle = index * Math.PI / 4;
          const candidate = document.elementFromPoint(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)?.closest(interactiveSelector);
          if (candidate) nearby.add(candidate);
        }
      }
    }
    for (const candidate of this.intersection ? nearby : this.candidates) {
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
        const left = Math.max(0, box.left);
        const right = Math.min(innerWidth, box.right);
        const top = Math.max(0, box.top);
        const bottom = Math.min(innerHeight, box.bottom);
        if (right <= left || bottom <= top) continue;
        const insetX = Math.min(1, (right - left) / 2);
        const insetY = Math.min(1, (bottom - top) / 2);
        const hitX = Math.max(left + insetX, Math.min(right - insetX, x));
        const hitY = Math.max(top + insetY, Math.min(bottom - insetY, y));
        const hit = document.elementFromPoint(hitX, hitY);
        // Geometry alone must not select a control behind a modal or another page layer.
        if (!hit || (hit !== candidate && !candidate.contains(hit))) continue;
        winner = candidate;
        distance = gap;
      }
    }
    return winner;
  }
  destroy() {
    this.intersection?.disconnect();
    this.mutations?.disconnect();
    this.visible.clear();
    this.candidates = [];
  }
}
