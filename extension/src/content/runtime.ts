import { ActivationGate } from "../core/safety";
import {
  defaults,
  type Intent,
  type Message,
  type PointerSample,
  type Settings,
} from "../shared";
import {
  editable,
  formFor,
  insertText,
  PageTargets,
  pageContext,
  sensitive,
  submitControl,
  targetLabel,
  usable,
} from "./dom";
import { Overlay } from "./overlay";

type Pending = {
  target: HTMLElement;
  form: HTMLFormElement;
  method: "click" | "submit";
  expires: number;
  url: string;
  signature: string;
};
type SendMessage = (message: Message) => Promise<unknown>;

export class ContentRuntime {
  private targets = new PageTargets();
  private overlay = new Overlay();
  private gate = new ActivationGate({
    dwellMs: defaults.dwellMs,
    confidenceThreshold: defaults.confidenceThreshold,
  });
  private settings: Settings = { ...defaults };
  private running = false;
  private paused = false;
  private dictating = false;
  private typingTarget: HTMLElement | null = null;
  private target: HTMLElement | null = null;
  private pointerTarget = false;
  private pending: Pending | null = null;
  private choices: HTMLElement[] = [];
  private sample: PointerSample | null = null;
  private receivedAt = 0;
  private x = 0;
  private y = 0;
  private edge: "up" | "down" | null = null;
  private edgeSince = 0;
  private edgeLast = 0;
  private frame = 0;
  private activationTarget: HTMLElement | null = null;
  private confirmedSubmission = false;
  private destroyed = false;
  private observer: MutationObserver;
  constructor(
    private send: SendMessage,
    private clock = () => performance.now(),
    private autoTick = true,
  ) {
    this.observer = new MutationObserver(() => {
      if (
        this.pending &&
        (!this.pending.target.isConnected ||
          !this.pending.form.isConnected ||
          sensitive(this.pending.target) ||
          this.formSignature(this.pending.target, this.pending.form) !==
            this.pending.signature)
      )
        this.cancelPending("The form changed. Submission cancelled.");
      if (
        this.typingTarget &&
        (!this.typingTarget.isConnected || !editable(this.typingTarget))
      )
        this.stopTyping("The text field is no longer available.");
    });
    this.observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "disabled",
        "readonly",
        "type",
        "autocomplete",
        "name",
        "action",
        "method",
        "formaction",
        "formmethod",
      ],
    });
    addEventListener("popstate", this.pageChanged);
    addEventListener("hashchange", this.pageChanged);
    addEventListener("keydown", this.onKey);
    addEventListener("scroll", this.onScroll, { passive: true });
    document.addEventListener("submit", this.onSubmit, true);
    document.addEventListener("focusin", this.onFocus, true);
    if (this.autoTick) this.frame = requestAnimationFrame(this.loop);
  }
  private feedback(text: string) {
    this.overlay.announce(text);
    void this.send({ type: "SET_STATE", patch: { feedback: text } }).catch(
      () => {},
    );
  }
  private metric(type: string, detail?: string) {
    void this.send({
      type: "METRIC",
      event: { type, detail, at: Date.now() },
    }).catch(() => {});
  }
  private pageChanged = () => {
    this.cancelPending("The page changed. Submission cancelled.");
    this.select(null);
    this.stopTyping();
    this.choices = [];
    this.overlay.options([]);
  };
  private onScroll = () => {
    this.overlay.target(this.target);
    this.overlay.options(this.choices);
  };
  private onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && this.running) {
      this.paused = true;
      this.stopTyping();
      this.cancelPending();
      this.gate.update({
        targetId: this.target ? this.targets.id(this.target) : null,
        confidence: 0,
        tracking: false,
        paused: true,
        now: this.clock(),
      });
      void this.send({ type: "PAUSE" }).catch(() => {});
      this.feedback("Handsfree paused. Resume from the controller.");
    }
  };
  private onFocus = (event: FocusEvent) => {
    if (
      this.dictating &&
      this.typingTarget &&
      event.target instanceof Node &&
      event.target !== this.typingTarget &&
      !this.typingTarget.contains(event.target)
    )
      this.stopTyping("Focus changed. Dictation stopped.");
  };
  private onSubmit = (event: SubmitEvent) => {
    if (
      !this.activationTarget ||
      this.confirmedSubmission ||
      !(event.target instanceof HTMLFormElement)
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = this.activationTarget;
    this.pending = {
      target,
      form: event.target,
      method: "click",
      expires: this.clock() + 10000,
      url: location.href,
      signature: this.formSignature(target, event.target),
    };
    this.feedback(
      "This action submits a form. Say confirm within 10 seconds, or cancel.",
    );
  };
  private loop = () => {
    this.tick();
    if (!this.destroyed) this.frame = requestAnimationFrame(this.loop);
  };
  private cancelPending(message?: string) {
    if (this.pending) {
      this.pending = null;
      if (message) this.feedback(message);
    }
  }
  private formSignature(element: HTMLElement, form: HTMLFormElement) {
    return [
      form.action,
      form.method,
      element.getAttribute("formaction"),
      element.getAttribute("formmethod"),
    ].join("|");
  }
  private select(element: HTMLElement | null, fromPointer?: boolean) {
    if (element !== this.target) {
      this.cancelPending("The target changed. Submission cancelled.");
      this.target = element;
      this.pointerTarget = fromPointer ?? false;
    } else if (fromPointer !== undefined) this.pointerTarget = fromPointer;
    this.overlay.target(element);
  }
  tick() {
    const now = this.clock();
    if (
      this.pending &&
      (now > this.pending.expires || location.href !== this.pending.url)
    )
      this.cancelPending("Confirmation expired. Ask to submit again.");
    const tracked = !!this.sample && now - this.receivedAt < 650;
    const confident =
      tracked && this.sample!.confidence >= this.settings.confidenceThreshold;
    const blocked =
      !this.running ||
      this.paused ||
      this.dictating ||
      !!this.pending ||
      this.choices.length > 0;
    const result = this.gate.update({
      targetId:
        this.target && this.pointerTarget ? this.targets.id(this.target) : null,
      confidence: this.sample?.confidence ?? 0,
      paused: blocked,
      tracking: tracked,
      now,
      activate:
        !this.settings.dwellEnabled && this.sample?.handHold ? "hand" : "dwell",
      handHold: !this.settings.dwellEnabled && (this.sample?.handHold ?? false),
      dwellEnabled: this.settings.dwellEnabled,
    });
    this.overlay.pointer(
      this.x,
      this.y,
      this.running && !!this.sample,
      blocked ? 0 : result.progress,
    );
    if (result.activate && this.target && usable(this.target))
      this.activate(this.target, "pointer");
    if (
      !blocked &&
      confident &&
      this.settings.edgeScroll &&
      !this.choices.length
    ) {
      const direction =
        this.y < 38 ? "up" : this.y > innerHeight - 38 ? "down" : null;
      if (direction !== this.edge) {
        this.edge = direction;
        this.edgeSince = now;
        this.edgeLast = now;
      }
      if (
        direction &&
        now - this.edgeSince >= 900 &&
        now - this.edgeLast >= 700
      ) {
        this.scroll(direction);
        this.edgeLast = now;
      }
    } else {
      this.edge = null;
      this.edgeSince = now;
    }
  }
  private scroll(direction: "up" | "down") {
    window.scrollBy({
      top: (direction === "down" ? 1 : -1) * Math.max(200, innerHeight * 0.65),
      behavior: "instant",
    });
    this.metric("scroll", direction);
  }
  async handle(message: Message): Promise<unknown> {
    switch (message.type) {
      case "PAGE_STATE": {
        const wasRunning = this.running;
        this.running = message.running;
        this.paused = message.paused;
        if (
          this.settings.dwellMs !== message.settings.dwellMs ||
          this.settings.confidenceThreshold !==
            message.settings.confidenceThreshold
        )
          this.gate.configure({
            dwellMs: message.settings.dwellMs,
            confidenceThreshold: message.settings.confidenceThreshold,
          });
        this.settings = message.settings;
        if (!this.running || this.paused) {
          this.cancelPending();
          this.stopTyping();
          this.edge = null;
          if (!this.running) this.gate.reset();
          else
            this.gate.update({
              targetId: this.target ? this.targets.id(this.target) : null,
              confidence: 0,
              tracking: false,
              paused: true,
              now: this.clock(),
            });
        } else if (!message.dictating && this.dictating) this.stopTyping();
        if (!this.running) {
          this.select(null);
          this.sample = null;
          this.overlay.pointer(0, 0, false);
          this.overlay.options([]);
          this.choices = [];
          this.overlay.announce("");
          this.overlay.transcript("", false, false);
        } else if (!wasRunning)
          this.feedback(
            "Handsfree is ready. Point at a target or say find followed by its name.",
          );
        if (this.paused) this.overlay.transcript("", false, false);
        return { ok: true };
      }
      case "POINTER": {
        const sample = message.sample;
        if (
          !Number.isFinite(sample.x) ||
          !Number.isFinite(sample.y) ||
          !Number.isFinite(sample.confidence)
        )
          return { ok: false };
        this.sample = sample;
        this.receivedAt = this.clock();
        if (
          this.running &&
          !this.paused &&
          !this.dictating &&
          sample.confidence >= this.settings.confidenceThreshold
        ) {
          this.x = Math.max(0, Math.min(1, sample.x)) * innerWidth;
          this.y = Math.max(0, Math.min(1, sample.y)) * innerHeight;
          if (!this.choices.length)
            this.select(this.targets.snap(this.x, this.y), true);
        }
        this.tick();
        return { ok: true };
      }
      case "GET_PAGE_CONTEXT":
        return pageContext();
      case "ANSWER":
        if (!this.running || this.paused || typeof message.text !== "string" || message.text.length > 6000) return { ok: false };
        this.feedback(message.text);
        return { ok: true };
      case "GET_TARGETS":
        return this.targets.scan();
      case "TRANSCRIPT":
        this.overlay.transcript(message.text, message.final, this.running && !this.paused);
        return { ok: true };
      case "FIND_RESULT": {
        if (!this.running || this.paused) return { ok: false };
        const matches = [...new Set(message.ids)]
          .map((id) => this.targets.get(id))
          .filter((item): item is HTMLElement => !!item);
        this.cancelPending();
        this.gate.reset();
        if (!matches.length) {
          this.select(null);
          this.choices = [];
          this.overlay.options([]);
          this.feedback("No matching target found on this page.");
          return { ok: true };
        }
        if (matches.length > 1) {
          this.select(null);
          this.choices = matches.slice(0, 5);
          this.choices[0].scrollIntoView({
            block: "center",
            behavior: "instant",
          });
          this.overlay.options(this.choices);
          this.feedback(
            `Several targets match. ${this.choices.map((target, index) => `${index + 1}: ${targetLabel(target)}`).join(". ")}. Say choose followed by the number.`,
          );
        } else {
          this.choices = [];
          this.overlay.options([]);
          matches[0].scrollIntoView({ block: "center", behavior: "instant" });
          this.select(matches[0], false);
          this.feedback(
            `Found ${targetLabel(matches[0])}. Say click this to activate.`,
          );
        }
        return { ok: true };
      }
      case "PAGE_ACTION": {
        const ok = this.action(message.intent);
        return { ok, dictating: this.dictating };
      }
      case "DICTATE": {
        if (
          !this.running ||
          this.paused ||
          !this.dictating ||
          !this.typingTarget
        )
          return { ok: false };
        if (
          document.activeElement !== this.typingTarget &&
          !this.typingTarget.contains(document.activeElement)
        ) {
          this.stopTyping("Focus changed. Dictation stopped.");
          return { ok: false };
        }
        const success = insertText(this.typingTarget, message.text);
        if (!success) this.stopTyping("This field cannot accept dictation.");
        else this.metric("dictation-insert");
        return { ok: success };
      }
      default:
        return { ok: false };
    }
  }
  private voiceAllowed(): boolean {
    if (!this.running || this.paused) {
      this.feedback("Handsfree is paused. Resume before using page commands.");
      return false;
    }
    const tracking =
      !this.pointerTarget ||
      (!!this.sample && this.clock() - this.receivedAt < 650);
    const confidence = this.pointerTarget ? (this.sample?.confidence ?? 0) : 1;
    // An explicit voice request is a new intention. It does not clear the pointer's dwell latch.
    const voiceGate = new ActivationGate({
      dwellMs: this.settings.dwellMs,
      confidenceThreshold: this.settings.confidenceThreshold,
    });
    const result = voiceGate.update({
      targetId: this.target
        ? this.targets.id(this.target)
        : "voice-page-action",
      confidence,
      paused: false,
      tracking,
      now: this.clock(),
      activate: "voice",
    });
    if (!result.activate)
      this.feedback(
        "Tracking is uncertain. Move back into view before activating a target.",
      );
    return result.activate;
  }
  private action(intent: Intent): boolean {
    if (intent.type === "cancel") {
      this.cancelPending();
      this.choices = [];
      this.overlay.options([]);
      this.feedback("Cancelled.");
      return true;
    }
    if (intent.type === "stop-typing") {
      this.stopTyping("Dictation stopped.");
      return true;
    }
    if (!this.running || this.paused) return false;
    if (intent.type === "confirm") {
      const pending = this.pending;
      if (
        !pending ||
        this.clock() > pending.expires ||
        location.href !== pending.url ||
        pending.target !== this.target ||
        !pending.target.isConnected ||
        !pending.form.isConnected ||
        !usable(pending.target) ||
        sensitive(pending.target) ||
        this.formSignature(pending.target, pending.form) !== pending.signature
      ) {
        this.cancelPending();
        this.feedback("Nothing is waiting for confirmation.");
        return false;
      }
      if (!this.voiceAllowed()) return false;
      this.pending = null;
      this.stopTyping();
      this.metric("submit-confirmed");
      this.confirmedSubmission = true;
      try {
        if (pending.method === "click") pending.target.click();
        else pending.form.requestSubmit();
      } finally {
        this.confirmedSubmission = false;
      }
      this.feedback("Submission confirmed.");
      return true;
    }
    if (intent.type === "choose") {
      const choice = this.choices[intent.index - 1];
      if (!choice || !choice.isConnected || !usable(choice)) {
        this.feedback(
          "That option is not available. Say choose followed by a listed number.",
        );
        return false;
      }
      this.choices = [];
      this.overlay.options([]);
      choice.scrollIntoView({ block: "center", behavior: "instant" });
      this.select(choice, false);
      this.gate.reset();
      this.feedback(
        `Selected ${targetLabel(choice)}. Say click this to activate.`,
      );
      return true;
    }
    if (intent.type === "click-target") {
      if (this.dictating) return false;
      const ids = this.targets.named(intent.query);
      if (ids.length !== 1) {
        void this.handle({ type: "FIND_RESULT", ids });
        return true;
      }
      const target = this.targets.get(ids[0]);
      if (!target) return false;
      this.choices = [];
      this.overlay.options([]);
      this.select(target, false);
      target.scrollIntoView({ block: "center", behavior: "instant" });
      if (!this.voiceAllowed()) return false;
      return this.activate(target, "voice");
    }
    if (intent.type === "scroll") {
      this.cancelPending();
      this.scroll(intent.direction);
      return true;
    }
    if (intent.type === "back" || intent.type === "forward") {
      this.pageChanged();
      intent.type === "back" ? history.back() : history.forward();
      return true;
    }
    if (intent.type === "start-typing") {
      const element = this.target
        ? editable(this.target)
          ? this.target
          : null
        : document.activeElement instanceof HTMLElement &&
            editable(document.activeElement)
          ? document.activeElement
          : null;
      if (!element) {
        this.feedback(
          "Point at an editable text field first. Password and payment fields are blocked.",
        );
        return false;
      }
      if (!this.voiceAllowed()) return false;
      this.cancelPending();
      this.typingTarget = element;
      element.focus({ preventScroll: true });
      this.select(element);
      this.dictating = true;
      this.gate.reset();
      void this.send({ type: "SET_STATE", patch: { dictating: true } }).catch(
        () => {},
      );
      this.feedback(
        "Dictation is on. Say stop typing to finish. Submission always needs a separate confirmation.",
      );
      return true;
    }
    if (intent.type === "submit") {
      const element =
        this.typingTarget ||
        this.target ||
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null);
      const form = formFor(element);
      if (!element || !form || sensitive(element)) {
        this.feedback("Select a form field before asking to submit.");
        return false;
      }
      if (!this.voiceAllowed()) return false;
      this.select(element);
      this.pending = {
        target: element,
        form,
        method: "submit",
        expires: this.clock() + 10000,
        url: location.href,
        signature: this.formSignature(element, form),
      };
      this.stopTyping();
      this.feedback(
        "Ready to submit this form. Say confirm within 10 seconds, or cancel.",
      );
      return true;
    }
    if (intent.type === "click" || intent.type === "open") {
      if (
        !this.target &&
        document.activeElement instanceof HTMLElement &&
        document.activeElement.matches(
          'a[href],button,input,textarea,[contenteditable="true"]',
        ) &&
        usable(document.activeElement)
      )
        this.select(document.activeElement);
      if (!this.target) {
        this.feedback(
          "No target selected. Point at a link, button, or field, or use find.",
        );
        return false;
      }
      if (!this.voiceAllowed()) return false;
      return this.activate(this.target, "voice");
    }
    return false;
  }
  private activate(element: HTMLElement, source: "voice" | "pointer"): boolean {
    if (!element.isConnected || !usable(element) || sensitive(element)) {
      this.feedback("That target is unavailable or sensitive.");
      return false;
    }
    if (submitControl(element)) {
      const form = formFor(element)!;
      this.pending = {
        target: element,
        form,
        method: "click",
        expires: this.clock() + 10000,
        url: location.href,
        signature: this.formSignature(element, form),
      };
      this.feedback(
        "This button submits a form. Say confirm within 10 seconds, or cancel.",
      );
      return true;
    }
    if (editable(element)) element.focus({ preventScroll: true });
    else {
      this.activationTarget = element;
      try {
        element.click();
      } finally {
        this.activationTarget = null;
      }
    }
    this.metric("activation", source);
    if (!this.pending) this.feedback(`Selected ${targetLabel(element)}.`);
    return true;
  }
  private stopTyping(message?: string) {
    if (!this.dictating && !this.typingTarget) return;
    this.dictating = false;
    this.typingTarget = null;
    this.gate.reset();
    void this.send({ type: "SET_STATE", patch: { dictating: false } }).catch(
      () => {},
    );
    if (message) this.feedback(message);
  }
  destroy() {
    this.targets.destroy();
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.overlay.destroy();
    removeEventListener("popstate", this.pageChanged);
    removeEventListener("hashchange", this.pageChanged);
    removeEventListener("keydown", this.onKey);
    removeEventListener("scroll", this.onScroll);
    document.removeEventListener("submit", this.onSubmit, true);
    document.removeEventListener("focusin", this.onFocus, true);
  }
}
