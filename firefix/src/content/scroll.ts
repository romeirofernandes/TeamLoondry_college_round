/** Scroll the closest container that can consume this direction. At a boundary,
 * continue up the ancestor chain so embedded lists never trap page scrolling. */
export function scrollPixels(top: number, origin: Element | null) {
  if (!top) return;
  for (let element = origin; element; element = element.parentElement) {
    if (!(element instanceof HTMLElement) || element === document.body || element === document.documentElement) continue;
    const overflow = getComputedStyle(element).overflowY;
    const maximum = element.scrollHeight - element.clientHeight;
    if (/^(auto|scroll|overlay)$/.test(overflow) && maximum > 1 &&
        (top > 0 ? element.scrollTop < maximum - 1 : element.scrollTop > 1)) {
      const available = top > 0 ? maximum - element.scrollTop : element.scrollTop;
      const consumed = Math.sign(top) * Math.min(Math.abs(top), available);
      element.scrollBy({ top: consumed, behavior: "instant" });
      const remainder = top - consumed;
      if (remainder) scrollPixels(remainder, element.parentElement);
      return;
    }
  }
  window.scrollBy({ top, behavior: "instant" });
}

/** Own the animation so pause, stop and navigation can cancel pending movement. */
export class ScrollMotion {
  private animation: { top: number; origin: Element | null; elapsed: number; last: number; progress: number } | null = null;
  get active() { return this.animation !== null; }
  cancel() { this.animation = null; }
  command(top: number, origin: Element | null, now: number) {
    this.cancel();
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      scrollPixels(top, origin);
    } else {
      this.animation = { top, origin, elapsed: 0, last: now, progress: 0 };
    }
  }
  tick(now: number) {
    const a = this.animation;
    if (!a) return;
    a.elapsed += Math.max(0, Math.min(50, now - a.last));
    a.last = now;
    const t = Math.min(1, a.elapsed / 420);
    const progress = t * t * (3 - 2 * t);
    scrollPixels(a.top * (progress - a.progress), a.origin?.isConnected ? a.origin : null);
    a.progress = progress;
    if (t === 1) this.cancel();
  }
}
