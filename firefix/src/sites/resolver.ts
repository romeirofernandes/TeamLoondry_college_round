import {
  usable,
  sensitive,
  targetLabel,
  editable,
  insertText,
} from "../content/dom";
export { editable, insertText };
/** Background modal controls and aria-hidden duplicates never enter voice choices. */
export function visible(element: Element): element is HTMLElement {
  if (
    !usable(element) ||
    element.closest('[aria-hidden="true"], [data-handsfree-ignore]') ||
    sensitive(element)
  )
    return false;
  const dialogs = [
    ...document.querySelectorAll(
      'dialog[open],[role="dialog"][aria-modal="true"]',
    ),
  ].filter((e) => usable(e));
  return !dialogs.length || dialogs.some((d) => d.contains(element));
}
export function elements(
  selector: string,
  scope: ParentNode = document,
): HTMLElement[] {
  const found = [...scope.querySelectorAll(selector)];
  for (const host of scope.querySelectorAll("*"))
    if (host.shadowRoot) found.push(...elements(selector, host.shadowRoot));
  return [...new Set(found)].filter(visible);
}
export function label(element: HTMLElement): string {
  return targetLabel(element).replace(/\s+/g, " ").trim().slice(0, 180);
}
export function norm(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}
export function controls(
  names: string[],
  scope: ParentNode = document,
): HTMLElement[] {
  const candidates = elements(
    'button,[role="button"],a[href],input:not([type="hidden"]),textarea,[contenteditable="true"],[role="tab"],[role="option"],[role="checkbox"],[role="radio"]',
    scope,
  );
  return candidates.filter((e) =>
    names.some((name) => norm(label(e)) === norm(name)),
  );
}
export function stateOf(
  element: HTMLElement,
  opposite: string[],
  inactive: string[] = [],
): boolean | null {
  const explicit =
    element.getAttribute("aria-pressed") ??
    element.getAttribute("aria-checked") ??
    element.getAttribute("aria-selected");
  if (explicit === "true" || explicit === "false") return explicit === "true";
  if (
    element instanceof HTMLInputElement &&
    ["checkbox", "radio"].includes(element.type)
  )
    return element.checked;
  if (opposite.some((name) => norm(name) === norm(label(element)))) return true;
  if (inactive.some((name) => norm(name) === norm(label(element))))
    return false;
  return null;
}
export function setInput(
  element: HTMLInputElement | HTMLSelectElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
    element,
    value,
  );
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
export async function until(
  check: () => boolean,
  valid: () => boolean,
  ms = 1600,
): Promise<boolean> {
  const deadline = performance.now() + ms;
  do {
    if (!valid()) return false;
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 40));
  } while (performance.now() < deadline);
  return false;
}
