import { SiteExecutor } from "../sites/executor";
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
  voiceUsable,
  voiceExposed,
  linkUrl,
} from "./dom";
import { Overlay } from "./overlay";
import { ScrollMotion, scrollPixels } from "./scroll";
import { mediaControl } from "./media";
import { FormAssistant } from "./forms";
import {PrivateKeyboard,passwordField} from "./private-keyboard";

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
  private privateInput=false;
  private privateEpoch=0;
  private privateAwaitLeave:DOMRect|null=null;
  private privateKeys=new PrivateKeyboard(()=>void this.resumeVoice(),()=>void this.popupControl(),()=>this.gate.reset());

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
  private sites = new SiteExecutor(undefined, () => Date.now(), () => this.settings.testWriteTargets.some(prefix => location.href.replace(/\/$/, "") === prefix.replace(/\/$/, "") || location.href.startsWith(prefix.replace(/\/$/, "") + "/")), (site, recipients) => recipients.length > 0 && recipients.every(recipient => this.settings.testMessageRecipients.includes(`${site}:${recipient}`.toLowerCase())));
  private typingTarget: HTMLElement | null = null;
  private forms = new FormAssistant();
  private target: HTMLElement | null = null;
  private pointerTarget = false;
  private pending: Pending | null = null;
  private choices: HTMLElement[] = [];
  private choiceDisposition: "new-tab" | "background" | undefined;
  private selectedDisposition: "new-tab" | "background" | undefined;
  private choiceSnapshots = new Map<HTMLElement, string>();
  private selectedSnapshot: string | null = null;
  private preparedLink: { id: string; url: string; pageUrl: string } | null = null;
  private sample: PointerSample | null = null;
  private receivedAt = 0;
  private x = 0;
  private y = 0;
  private edge: "up" | "down" | null = null;
  private edgeSince = 0;
  private edgeLast = 0;
  private scrollMotion = new ScrollMotion();
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
      this.forms.onMutation();
      if(this.privateKeys.active && !this.privateKeys.valid())this.privateKeys.close();
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
        "aria-label",
        "aria-labelledby",
        "aria-describedby",
        "aria-required",
        "aria-readonly",
        "aria-disabled",
        "aria-checked",
        "aria-controls",
        "aria-owns",
      ],
    });
    addEventListener("popstate", this.pageChanged);
    addEventListener("hashchange", this.pageChanged);
    addEventListener("keydown", this.onKey);
    addEventListener("scroll", this.onScroll, { passive: true });
    document.addEventListener("submit", this.onSubmit, true);
    document.addEventListener("focusin", this.onFocus, true);
    document.addEventListener("input", this.onFormEdit, true);
    document.addEventListener("change", this.onFormEdit, true);
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
  private selectionSignature(element: HTMLElement): string {
    const href = element.getAttribute("href");
    let destination: string | null = null;
    if (href !== null) {
      try { destination = new URL(href, document.baseURI).href; } catch { /* Invalid links retain their raw-href signature. */ }
    }
    return [location.href, targetLabel(element), href, destination, element.getAttribute("role"), element.getAttribute("type")].join("|");
  }
  private rememberChoices() {
    this.choiceSnapshots = new Map(this.choices.map(element => [element, this.selectionSignature(element)]));
  }
  private pageChanged = () => {
    if(this.privateKeys.active)this.privateKeys.close();
    this.sites.invalidate();
    this.forms.pageChanged();
    this.scrollMotion.cancel();
    this.edge = null;
    this.cancelPending("The page changed. Submission cancelled.");
    this.select(null);
    this.stopTyping();
    this.choices = [];
    this.choiceDisposition = undefined;
    this.selectedDisposition = undefined;
    this.overlay.options([]);
  };
  private onScroll = () => {
    this.overlay.target(this.target);
    this.overlay.options(this.choices);
  };
  private onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && this.running) {
      this.paused = true;
      this.scrollMotion.cancel();
      this.edge = null;
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
    if(this.running && event.target instanceof HTMLInputElement && event.target.type==="password")void this.enterPrivate(passwordField(event.target)?event.target:undefined);
    if (
      this.dictating &&
      this.typingTarget &&
      event.target instanceof Node &&
      event.target !== this.typingTarget &&
      !this.typingTarget.contains(event.target)
    )
      this.stopTyping("Focus changed. Dictation stopped.");
  };
  private async enterPrivate(field?:HTMLInputElement) {
    const epoch=++this.privateEpoch;
    this.privateInput=true;this.privateKeys.lock();
    this.scrollMotion.cancel();this.edge=null;this.sites.invalidate();this.forms.cancel();this.cancelPending();this.stopTyping();
    this.choices=[];this.overlay.options([]);this.select(null);this.overlay.transcript("",false,false);this.gate.reset();
    if(field)this.privateKeys.open(field);else this.privateKeys.show();
    try {
      const ack=await this.send({type:"PRIVATE_INPUT",command:"enter"}) as {ok?:boolean;privateInput?:boolean};
      if(!this.destroyed && epoch===this.privateEpoch)this.privateKeys.ready(ack?.ok===true&&ack.privateInput===true);
    } catch {if(epoch===this.privateEpoch)this.privateKeys.ready(false);}
  }
  private async resumeVoice() {
    if(this.privateKeys.active || passwordField(document.activeElement)){this.feedback("Finish private entry and leave the password field before resuming voice.");return;}
    const epoch=++this.privateEpoch;
    try {
      const result=await this.send({type:"PRIVATE_INPUT",command:"resume"}) as {ok?:boolean};
      if(epoch!==this.privateEpoch || result?.ok!==true)return;
      this.privateInput=false;this.privateKeys.destroy();this.gate.reset();
    } catch {this.feedback("Voice remains off. Reconnect Handsfree and retry.");}
  }
  private async popupControl() {
    this.privateKeys.close();
    try {const result=await this.send({type:"PRIVATE_POPUP",command:"start"}) as {ok?:boolean;error?:string};if(result?.ok===false)this.feedback(result.error||"Connect and calibrate the desktop companion first.");}
    catch{this.feedback("Connect and calibrate the macOS desktop companion to control Chrome popups.");}
  }
  private onFormEdit = (event: Event) => {
    if (event.target instanceof HTMLElement && event.target.matches('input,textarea,select,[role="combobox"],[role="radio"],[role="checkbox"]')) {
      this.forms.onUserEdit();
      if (this.pending) this.cancelPending("The form changed. Submission cancelled.");
    }
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
    if (fromPointer) this.selectedDisposition = undefined;
    if (element !== this.target) {
      this.cancelPending("The target changed. Submission cancelled.");
      this.target = element;
      this.pointerTarget = fromPointer ?? false;
    } else if (fromPointer !== undefined) this.pointerTarget = fromPointer;
    this.selectedSnapshot = element && !this.pointerTarget ? this.selectionSignature(element) : null;
    this.preparedLink = null;
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
    if(this.privateInput) {
      if(this.privateKeys.active && !this.privateKeys.valid())this.privateKeys.close();
      if(this.privateAwaitLeave){const r=this.privateAwaitLeave;if(this.x>=r.left&&this.x<=r.right&&this.y>=r.top&&this.y<=r.bottom){this.overlay.pointer(this.x,this.y,this.running&&!!this.sample,1);return;}this.privateAwaitLeave=null;this.gate.reset();}
      const button=this.privateKeys.hit(this.x,this.y);
      const result=this.gate.update({targetId:button?this.privateKeys.buttonId(button):null,confidence:this.sample?.confidence??0,paused:!this.running||this.paused,tracking:tracked,now,activate:!this.settings.dwellEnabled&&this.sample?.handHold?"hand":"dwell",handHold:!this.settings.dwellEnabled&&(this.sample?.handHold??false),dwellEnabled:this.settings.dwellEnabled});
      this.overlay.pointer(this.x,this.y,this.running&&!!this.sample,result.progress);
      if(result.activate&&button){this.privateAwaitLeave=button.getBoundingClientRect();this.privateKeys.activate(button);}
      return;
    }
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
      !this.scrollMotion.active &&
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
        now - this.edgeSince >= 900
      ) {
        this.scrollMotion.cancel();
        const elapsed = Math.max(0, Math.min(50, now - Math.max(this.edgeLast, this.edgeSince + 900)));
        const speed = Math.max(200, innerHeight * 0.55) * this.settings.scrollSensitivity;
        scrollPixels((direction === "down" ? 1 : -1) * speed * elapsed / 1000, document.elementFromPoint(this.x, this.y));
        this.edgeLast = now;
      }
    } else {
      this.edge = null;
      this.edgeSince = now;
    }
    if (blocked) this.scrollMotion.cancel();
    else this.scrollMotion.tick(now);
  }
  private scroll(direction: "up" | "down" | "top" | "bottom") {
    this.edge = null;
    const origin = this.target || document.elementFromPoint(this.x, this.y) || document.activeElement;
    if (direction === "top" || direction === "bottom") {
      this.scrollMotion.cancel();
      scrollPixels((direction === "bottom" ? 1 : -1) * Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 10000000), origin);
      this.metric("scroll", direction);
      return;
    }
    this.scrollMotion.command(
      (direction === "down" ? 1 : -1) * Math.max(200, innerHeight * 0.65) * this.settings.scrollSensitivity,
      origin, this.clock(),
    );
    this.metric("scroll", direction);
  }
  async handle(message: Message): Promise<unknown> {
    if(message.type==="GET_PRIVATE_STATUS")return {ok:true,active:this.privateKeys.active,focused:document.activeElement instanceof HTMLInputElement&&document.activeElement.type==="password"};
    if(this.privateInput && !["PAGE_STATE","POINTER"].includes(message.type)) {
      if(message.type==="GET_TARGETS")return [];
      if(["GET_PAGE_CONTEXT","GET_SITE_CONTEXT","GET_WHATSAPP_DRAFT"].includes(message.type))return null;
      return {ok:false,error:"Private entry is active. Use the private controls."};
    }
    switch (message.type) {
      case "GET_SITE_CONTEXT": return this.sites.snapshot();
      case "GET_WHATSAPP_DRAFT":
        return this.running && !this.paused && !this.dictating ? this.sites.whatsappDraft() : null;
      case "RUN_WHATSAPP_MESSAGE": {
        if (!this.running || this.paused || this.dictating) return { state: "unavailable", feedback: "Resume Handsfree and finish dictation before sending a saved message." };
        const result = await this.sites.sendRoutineMessage(message.message, message.requestId);
        this.feedback(result.feedback);
        return result;
      }
      case "SITE_DIALOGUE": {
        if (!this.running || this.paused || this.dictating) return null;
        const result = await this.sites.dialogue(message.text);
        if (result) this.feedback(result.feedback);
        return result;
      }
      case "PAGE_STATE": {
        const wasRunning = this.running;
        if(message.privateInput===true && !this.privateInput)void this.enterPrivate();
        if(message.privateInput===false && this.privateInput){this.privateInput=false;++this.privateEpoch;this.privateKeys.destroy();this.gate.reset();}
        if (this.settings.pointerMode !== message.settings.pointerMode || this.settings.voiceOnly !== message.settings.voiceOnly || JSON.stringify(this.settings.enabledInputs) !== JSON.stringify(message.settings.enabledInputs)) {
          this.gate.reset();
          this.sample = null;
          this.select(null);
          this.edge = null;
          this.scrollMotion.cancel();
          this.cancelPending();
          this.sites.invalidate();
        }
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
        this.overlay.style(this.settings.cursorStyle);
        if (!this.running || this.paused) {
          this.sites.invalidate();
          this.forms.cancel();
          this.cancelPending();
          this.stopTyping();
          this.edge = null;
          this.scrollMotion.cancel();
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
          if(this.privateKeys.active)this.privateKeys.close();
          this.select(null);
          this.sample = null;
          this.overlay.pointer(0, 0, false);
          this.overlay.options([]);
          this.choices = [];
          this.choiceDisposition = undefined;
          this.selectedDisposition = undefined;
          this.overlay.announce("");
          this.overlay.transcript("", false, false);
        } else if (!wasRunning)
          this.feedback(
            "Handsfree is ready. Point at a target or say find followed by its name.",
          );
        if(this.running && !this.privateInput && passwordField(document.activeElement))void this.enterPrivate(document.activeElement);
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
          if (!this.privateInput && !this.choices.length)
            this.select(this.targets.snap(this.x, this.y, this.target), true);
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
          this.choiceDisposition = undefined;
          this.overlay.options([]);
          this.feedback("No matching target found on this page.");
          return { ok: true };
        }
        if (matches.length > 1) {
          this.choiceDisposition = message.disposition;
          this.select(null);
          this.choices = matches.slice(0, 10);
          this.rememberChoices();
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
          this.choiceDisposition = undefined;
          this.overlay.options([]);
          matches[0].scrollIntoView({ block: "center", behavior: "instant" });
          this.select(matches[0], false);
          this.feedback(
            `Found ${targetLabel(matches[0])}. Say click this to activate.`,
          );
        }
        return { ok: true };
      }
      case "VALIDATE_LINK": {
        const link = this.preparedLink;
        return { ok: !!link && this.running && !this.paused && !this.dictating && message.id === link.id && message.url === link.url && message.pageUrl === location.href && message.pageUrl === link.pageUrl && !!this.target && this.targets.get(link.id) === this.target && this.selectedSnapshot === this.selectionSignature(this.target) && linkUrl(this.target) === message.url && voiceExposed(this.target) };
      }
      case "PAGE_ACTION": {
        if(message.intent.type==="private-keyboard") {
          if(!this.running||this.paused)return {ok:false};
          const focused=document.activeElement;
          const fields=Array.from(document.querySelectorAll('input[type="password"]')).filter(passwordField);
          const field=passwordField(focused)?focused:fields.length===1?fields[0]:null;
          if(!field){this.feedback(fields.length>1?"Point at the password field you want to enter.":"No supported password field. Use HTTPS or localhost and a top-level password input.");return {ok:false};}
          await this.enterPrivate(field);return {ok:true};
        }
        if (message.intent.type === "confirm" && this.running && !this.paused && !this.dictating) {
          const result=await this.sites.dialogue("confirm");
          if(result){this.feedback(result.feedback);return result;}
          const formResult = await this.forms.confirm();
          if (formResult) { this.feedback(formResult.feedback); return formResult; }
        }
        if (message.intent.type === "form-command") {
          if (!this.running || this.paused || this.dictating) return { ok: false, error: "Resume Handsfree before using form commands." };
          // Registered site adapters own their site actions and safety rules.
          if (this.sites.snapshot()?.site) {
            const result = { ok: false, feedback: "Use the site's dedicated commands here; generic form controls are disabled on supported sites." };
            this.feedback(result.feedback);
            return result;
          }
          this.cancelPending("Previous form confirmation cancelled.");
          if (message.intent.command.type === "choose" && !this.forms.ownsChoices) {
            const ok = this.action({ type: "choose", index: message.intent.command.index });
            return { ok, dictating: this.dictating };
          }
          const result = await this.forms.handle(message.intent.command);
          if (result.dictationTarget) {
            const element = result.dictationTarget;
            if (!element.isConnected || !editable(element)) return { ok: false, error: "That field is no longer available for dictation." };
            this.cancelPending();
            this.typingTarget = element;
            this.dictating = true;
            element.focus({ preventScroll: true });
            this.select(element);
            this.gate.reset();
            void this.send({ type: "SET_STATE", patch: { dictating: true } }).catch(() => {});
          }
          this.feedback(result.feedback);
          return { ...result, dictating: this.dictating };
        }
        if (message.intent.type === "site-action") {
          if (!this.running || this.paused || this.dictating) return { state: "unavailable", feedback: "Resume Handsfree before using page commands." };
          const result = await this.sites.run(message.intent);
          if (result.focusField) this.action({ type: "start-typing" });
          this.feedback(result.feedback);
          return { ...result, dictating: this.dictating };
        }
        if (message.intent.type === "cancel") this.sites.cancel();
        if (message.intent.type.startsWith("media-")) {
          if (!this.running || this.paused || this.dictating) return { ok: false };
          const result = await mediaControl(message.intent);
          this.feedback(result.error || "Player updated.");
          return result;
        }
        this.preparedLink = null;
        const ok = this.action(message.intent);
        const linkDisposition = this.preparedLink ? this.selectedDisposition : undefined;
        const response = { ok, dictating: this.dictating, ...(this.preparedLink ? { link: this.preparedLink } : {}), ...(linkDisposition ? { disposition: linkDisposition } : {}) };
        if (this.preparedLink && linkDisposition) this.selectedDisposition = undefined;
        return response;
      }
      case "AGENT_ACTION": {
        if (!this.running || this.paused || this.dictating || !this.voiceAllowed())
          return { ok: false, error: "Handsfree is paused or voice control is unavailable." };
        const action = message.action;
        if (action.type === "scroll") {
          this.scroll(action.direction);
          return { ok: true, changed: true };
        }
        if (action.type === "media") {
          const result = await mediaControl({ type: action.command === "play" ? "media-play" : "media-pause" });
          return { ok: result.found, changed: result.found, error: result.error };
        }
        const element = this.targets.get(action.targetId);
        if (!element || !voiceExposed(element)) return { ok: false, error: "That page control is no longer visible. I will inspect the page again." };
        if (action.type === "click") {
          if (element.matches('button,[role="button"],input[type="button"]') && /\b(send|post|delete|remove|buy|purchase|pay|checkout|confirm|publish|transfer|place order)\b/i.test(targetLabel(element)))
            return { ok: false, error: "I will not activate a control that may send, publish, delete, or purchase something." };
          const ok = this.activate(element, "voice");
          return { ok, changed: ok, error: ok ? undefined : "That control could not be activated safely." };
        }
        if (!(element instanceof HTMLInputElement) || !["search", "text"].includes(element.type) && element.getAttribute("role") !== "searchbox")
          return { ok: false, error: "Search can only use a visible search field." };
        const form = formFor(element);
        if (!form || (form.method || "get").toLowerCase() !== "get")
          return { ok: false, error: "That search field does not use a safe GET search form." };
        let destination: URL;
        try { destination = new URL(form.action || location.href, location.href); }
        catch { return { ok: false, error: "That search form has an invalid destination." }; }
        if (destination.origin !== location.origin || !/^https?:$/.test(destination.protocol))
          return { ok: false, error: "That search form leads outside this site." };
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(element, action.query);
        element.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: action.query }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        form.requestSubmit();
        return { ok: true, changed: true };
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
      this.forms.cancel();
      this.cancelPending();
      this.choices = [];
      this.choiceDisposition = undefined;
      this.selectedDisposition = undefined;
      this.overlay.options([]);
      this.feedback("Cancelled.");
      return true;
    }
    if (intent.type === "stop-typing") {
      this.stopTyping("Dictation stopped.");
      return true;
    }
    if (!this.running || this.paused) return false;
    if (this.sites.snapshot()?.site && (intent.type === "submit" || intent.type === "confirm" && this.pending)) {
      this.cancelPending();
      this.feedback("Use a dedicated site submission command. Generic form confirmation cannot publish content on this site.");
      return false;
    }
    if (this.dictating && ["click-link", "click-target", "focus-target", "show-links", "choose"].includes(intent.type)) return false;
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
        (this.selectedSnapshot !== null && (this.selectedSnapshot !== this.selectionSignature(pending.target) || !voiceExposed(pending.target))) ||
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
      if (!choice || !choice.isConnected || !voiceUsable(choice) || this.choiceSnapshots.get(choice) !== this.selectionSignature(choice)) {
        this.feedback(
          "That option is not available. Say choose followed by a listed number.",
        );
        return false;
      }
      this.choices = [];
      this.selectedDisposition = this.choiceDisposition;
      this.choiceDisposition = undefined;
      this.overlay.options([]);
      choice.scrollIntoView({ block: "center", behavior: "instant" });
      this.select(choice, false);
      this.gate.reset();
      this.feedback(
        `Selected ${targetLabel(choice)}. Say click this to activate.`,
      );
      return true;
    }
    if (intent.type === "show-links") {
      this.choiceDisposition = undefined;
      this.selectedDisposition = undefined;
      this.choices = this.targets.links().slice(0, 10).map(id => this.targets.get(id)).filter((element): element is HTMLElement => !!element);
      this.select(null);
      this.cancelPending();
      this.rememberChoices();
      this.overlay.options(this.choices);
      this.feedback(this.choices.length ? `Links: ${this.choices.map((element, index) => `${index + 1}: ${targetLabel(element)}`).join(". ")}. Say choose followed by a number, then click this.` : "No links found on this page.");
      return true;
    }
    if (intent.type === "click-target" || intent.type === "click-link" || intent.type === "focus-target") {
      const ids = intent.type === "click-link" ? this.targets.links().slice(intent.index - 1, intent.index) : intent.type === "focus-target" ? this.targets.fields(intent.query) : this.targets.named(intent.query);
      if (ids.length !== 1) {
        void this.handle({ type: "FIND_RESULT", ids, disposition: intent.type === "focus-target" ? undefined : intent.disposition });
        return true;
      }
      const target = this.targets.get(ids[0]);
      if (!target) return false;
      this.choices = [];
      this.choiceDisposition = undefined;
      this.selectedDisposition = intent.type === "focus-target" ? undefined : intent.disposition;
      this.overlay.options([]);
      this.select(target, false);
      target.scrollIntoView({ block: "center", behavior: "instant" });
      if (!voiceExposed(target) || !this.voiceAllowed()) {
        this.feedback("That target is covered or unavailable.");
        return false;
      }
      if (intent.type === "focus-target") {
        if (!editable(target)) return false;
        target.focus({ preventScroll: true });
        this.feedback(`Focused ${targetLabel(target)}.`);
        return true;
      }
      if (intent.disposition) {
        const url = linkUrl(target);
        if (!url || !target.matches('a[href],[role="link"]')) {
          this.feedback("Only HTTP or HTTPS links can open in another tab.");
          return false;
        }
        this.preparedLink = { id: this.targets.id(target), url, pageUrl: location.href };
        return true;
      }
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
      // A named find still addresses its selected target. Pointer clicks use the
      // last cursor position, even when the page has no semantic target there.
      if ((!this.target || this.pointerTarget) && this.sample) {
        if (this.clock() - this.receivedAt >= 650 || this.sample.confidence < this.settings.confidenceThreshold) {
          this.feedback("Tracking is uncertain. Move back into view before clicking.");
          return false;
        }
        let hit: Element | null = document.elementFromPoint(this.x, this.y);
        let localX = this.x, localY = this.y;
        while (hit) {
          const nested = hit.shadowRoot?.elementFromPoint?.(localX, localY);
          if (nested && nested !== hit) { hit = nested; continue; }
          if (hit instanceof HTMLIFrameElement) {
            try {
              const box = hit.getBoundingClientRect();
              const nestedHit = hit.contentDocument?.elementFromPoint(localX - box.left, localY - box.top);
              if (nestedHit) { localX -= box.left; localY -= box.top; hit = nestedHit; continue; }
            } catch { /* Cross-origin media commands are handled in background. */ }
          }
          break;
        }
        const element = hit?.closest('a[href],button,input,textarea,select,[contenteditable],[role="button"],[role="link"]') || hit;
        if (element instanceof HTMLElement && usable(element)) {
          if (element instanceof HTMLIFrameElement) {
            this.feedback("Use play video, pause video, forward ten seconds or rewind for this embedded player.");
            return false;
          }
          this.select(element, true);
          this.choices = [];
          this.overlay.options([]);
          if (!this.voiceAllowed()) return false;
          return this.activate(element, "voice", { x: localX, y: localY });
        }
        this.feedback("No available click area at the cursor position.");
        return false;
      }
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
      if (this.selectedSnapshot && (this.selectedSnapshot !== this.selectionSignature(this.target) || !voiceExposed(this.target))) {
        this.select(null); this.feedback("The selected target changed. Select it again."); return false;
      }
      if (!this.voiceAllowed()) return false;
      if (this.selectedDisposition) {
        const url = linkUrl(this.target);
        if (!url || !this.target.matches('a[href],[role="link"]')) {
          this.feedback("Only HTTP or HTTPS links can open in another tab.");
          return false;
        }
        this.preparedLink = { id: this.targets.id(this.target), url, pageUrl: location.href };
        return true;
      }
      return this.activate(this.target, "voice");
    }
    return false;
  }
  private activate(element: HTMLElement, source: "voice" | "pointer", point?: { x: number; y: number }): boolean {
    if(source==="pointer" && passwordField(element)){element.focus({preventScroll:true});if(!this.privateInput)void this.enterPrivate(element);return true;}
    if (!element.isConnected || !usable(element) || sensitive(element)) {
      this.feedback("That target is unavailable or sensitive.");
      return false;
    }
    const siteGuard = this.sites.guardActivation(element);
    if (siteGuard === "blocked") { this.feedback("This account action requires a supported site command and explicit confirmation. It was not activated."); return false; }
    if (siteGuard) { void this.sites.run(siteGuard).then(result => this.feedback(result.feedback)); return false; }
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
        if (point) {
          const options = { bubbles: true, cancelable: true, composed: true, clientX: point.x, clientY: point.y, button: 0 };
          for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
            const event = type.startsWith("pointer") && typeof PointerEvent !== "undefined" ? new PointerEvent(type, { ...options, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: type === "pointerdown" ? 1 : 0 }) : new MouseEvent(type, { ...options, buttons: type === "mousedown" ? 1 : 0 });
            element.dispatchEvent(event);
          }
        } else element.click();
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
    this.sites.invalidate();
    this.scrollMotion.cancel();
    this.targets.destroy();
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.overlay.destroy();
    ++this.privateEpoch;this.privateKeys.destroy();
    removeEventListener("popstate", this.pageChanged);
    removeEventListener("hashchange", this.pageChanged);
    removeEventListener("keydown", this.onKey);
    removeEventListener("scroll", this.onScroll);
    document.removeEventListener("submit", this.onSubmit, true);
    document.removeEventListener("focusin", this.onFocus, true);
    document.removeEventListener("input", this.onFormEdit, true);
    document.removeEventListener("change", this.onFormEdit, true);
  }
}
