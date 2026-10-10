import { overlayId, targetLabel } from "./dom";

export class Overlay {
  readonly host = document.createElement("div");
  private cursor: HTMLDivElement;
  private ring: SVGCircleElement;
  private outline: HTMLDivElement;
  private label: HTMLDivElement;
  private feedback: HTMLDivElement;
  private choices: HTMLDivElement;
  constructor() {
    this.host.id = overlayId;
    this.host.dataset.handsfreeIgnore = "true";
    this.host.style.cssText =
      "position:fixed;inset:0;pointer-events:none!important;z-index:2147483647;";
    const shadow = this.host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      :host{all:initial;pointer-events:none!important}*{box-sizing:border-box;pointer-events:none!important}
      .cursor{position:fixed;left:0;top:0;width:38px;height:38px;transform:translate(-50%,-50%);display:none}
      .cursor:after{content:'';position:absolute;width:10px;height:10px;left:14px;top:14px;background:#c1ef53;border:2px solid #20231b;border-radius:50%}
      svg{width:38px;height:38px;transform:rotate(-90deg);filter:drop-shadow(0 0 2px #20231b)}
      circle{fill:none;stroke:#c1ef53;stroke-width:4;stroke-dasharray:100;stroke-dashoffset:100}
      .outline{position:fixed;border:3px solid #c1ef53;border-radius:7px;box-shadow:0 0 0 2px #20231b;display:none}
      .label,.feedback,.choice{position:fixed;background:#20231b;color:#f6f7f2;border:1px solid #c1ef53;border-radius:9px;font:600 14px/1.5 system-ui,sans-serif;padding:8px 12px;max-width:min(430px,calc(100vw - 24px));overflow-wrap:anywhere}
      .label{display:none}.feedback{bottom:18px;left:18px}.feedback:empty{display:none}
      .choice{padding:4px 8px;transform:translateY(-100%)}
    </style><div class="outline"></div><div class="label"></div><div class="cursor"><svg viewBox="0 0 38 38" aria-hidden="true"><circle cx="19" cy="19" r="15" pathLength="100"/></svg></div><div class="choices"></div><div class="feedback" role="status" aria-live="polite" aria-atomic="true"></div>`;
    this.cursor = shadow.querySelector(".cursor")!;
    this.ring = shadow.querySelector("circle")!;
    this.outline = shadow.querySelector(".outline")!;
    this.label = shadow.querySelector(".label")!;
    this.feedback = shadow.querySelector(".feedback")!;
    this.choices = shadow.querySelector(".choices")!;
    document.documentElement.append(this.host);
  }
  pointer(x: number, y: number, visible: boolean, progress = 0) {
    this.cursor.style.display = visible ? "block" : "none";
    this.cursor.style.left = `${x}px`;
    this.cursor.style.top = `${y}px`;
    this.ring.style.strokeDashoffset = String(
      100 - Math.min(1, Math.max(0, progress)) * 100,
    );
  }
  target(element: HTMLElement | null) {
    this.outline.style.display = element ? "block" : "none";
    this.label.style.display = element ? "block" : "none";
    if (!element) return;
    const box = element.getBoundingClientRect();
    Object.assign(this.outline.style, {
      left: `${box.left - 3}px`,
      top: `${box.top - 3}px`,
      width: `${box.width + 6}px`,
      height: `${box.height + 6}px`,
    });
    this.label.textContent = targetLabel(element);
    this.label.style.left = `${Math.max(12, Math.min(innerWidth - Math.min(430, innerWidth - 24), box.left))}px`;
    this.label.style.top = `${Math.min(innerHeight - 60, Math.max(12, box.bottom + 8))}px`;
  }
  announce(text: string) {
    this.feedback.textContent = text;
  }
  options(elements: HTMLElement[]) {
    this.choices.replaceChildren(
      ...elements.map((element, index) => {
        const node = document.createElement("div");
        node.className = "choice";
        node.textContent = `${index + 1}. ${targetLabel(element)}`;
        const box = element.getBoundingClientRect();
        node.style.left = `${Math.max(8, Math.min(innerWidth - 220, box.left))}px`;
        node.style.top = `${Math.max(38, box.top)}px`;
        return node;
      }),
    );
  }
  destroy() {
    this.host.remove();
  }
}
