import { overlayId, usable } from "./dom";

/** This model stays in the content script. It never stores or returns answer values. */
export type FormControlType =
  | "text" | "email" | "tel" | "url" | "number" | "search" | "textarea"
  | "date" | "time" | "datetime-local" | "month" | "week"
  | "select" | "combobox" | "radio-group" | "checkbox" | "unsupported";
export type FormSensitivity =
  | { status: "safe" }
  | { status: "blocked"; reason: "sensitive" | "uncertain" };

export interface FormOption {
  readonly id: string;
  readonly label: string;
  readonly element: HTMLElement;
  readonly disabled: boolean;
}

export interface FormControl {
  readonly id: string;
  readonly formId: string;
  readonly element: HTMLElement;
  readonly members: readonly HTMLElement[];
  readonly name: string;
  readonly type: FormControlType;
  readonly required: boolean;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly completed: boolean;
  readonly options: readonly FormOption[];
  readonly sensitivity: FormSensitivity;
  readonly section: string;
  readonly supported: boolean;
}

export interface FormEntry {
  readonly id: string;
  readonly root: HTMLFormElement | HTMLElement | Document;
  readonly name: string;
  readonly controls: readonly FormControl[];
  readonly signature: string;
}

export interface FormInventory {
  readonly documentId: string;
  readonly signature: string;
  readonly forms: readonly FormEntry[];
}

const controlSelector = 'input:not([type="hidden"]),textarea,select,[role="combobox"],[role="radio"],[role="checkbox"]';
const ignoredText = 'input,textarea,select,option,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="alert"],[aria-live],script,style,noscript,template,[data-private],[data-handsfree-ignore]';
const privateRegion = `[data-private],[data-handsfree-ignore],#${overlayId}`;
const sensitivePatterns = [
  /\b(?:password|passwd|passcode|one[ -]?time(?:[ -]?(?:code|password))?|otp|verification[ -]?code|security[ -]?code)\b/i,
  /\b(?:credit|debit|payment|card(?:[ -]?(?:number|holder|expiry|expiration|details?))?|cvv|cvc|cc[ -]?(?:number|name|exp|csc|type)|bank|routing|iban|swift|account[ -]?number|upi[ -]?id)\b/i,
  /\b(?:passport|aadh?aar|social[ -]?security|ssn|national[ -]?(?:id|identifier|identification|insurance[ -]?number|number)|(?:government|govt)[ -]?(?:issued[ -]?)?(?:id|identifier|identification|number)|state[ -]?id|driver'?s?[ -]?licen[cs]e|birth[ -]?certificate|citizenship[ -]?(?:id|number)|tax(?:payer)?[ -]?(?:id|identifier|identification|number|reference|code|registration)|tin|ein|gstin|gst[ -]?(?:number|id|registration)|vat[ -]?(?:number|id|registration)|pan[ -]?(?:card|number)|voter[ -]?(?:id|number))\b/i,
  /\b(?:medical|health|diagnos(?:is|es|tic)|medications?|prescription|symptoms?|patients?|disabilit(?:y|ies)|allerg(?:y|ies)|blood[ -]?(?:type|group|pressure|sugar|glucose)|hiv|aids|pregnan(?:cy|t)|mental[ -]?(?:health|illness|disorder)|chronic|illness|disease|treatment|therapy|surgery|surgical|vaccin(?:e|ation|ated)|immuni[sz]ation|cholesterol|glucose|bmi|cancers?|tumou?rs?|oncolog(?:y|ical|ist)|malignan(?:t|cy)|diabet(?:es|ic)|asthma|hypertension|stroke|cardiac|heart[ -]?(?:disease|condition)|kidney[ -]?(?:disease|condition)|clinical|psychiatr(?:ic|y|ist)|addiction|infection|hepatitis|hospitali[sz]ation|family[ -]?history|(?:health|disease|surgical|treatment|patient)[ -]?history|history[ -]?of[ -]?(?:illness|disease|cancer|surgery|treatment))\b/i,
];
const vagueName = /^(?:other|answer|response|field|input|text|select|choose|option|yes|no|please specify|untitled|id|identifier|number|code|reference|details?|information|history|status|condition|date|expiry|expiration|secret|confidential|sensitive|identity|personal (?:details|information|data)|(?:please )?(?:enter|describe|specify)(?: here)?|additional (?:details|information)|question\s*\d+)(?:\s*\d+)?$/i;
const unqualifiedName = /^(?:id|identifier|number|code|reference|details?|information|history|status|condition|date|expiry|expiration)$/i;

function bounded(value: string, length = 180): string {
  return value.replace(/\s+/g, " ").trim().slice(0, length);
}

/** Attribute names often carry meaning as camelCase, snake_case, or kebab-case. */
function semanticText(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_./-]+/g, " ").replace(/\s+/g, " ").trim();
}

function contactKind(value: string): "email" | "phone" | "url" | null {
  const normalized = semanticText(value).toLowerCase();
  const kinds = [
    /\b(?:email|e mail)\b/.test(normalized) ? "email" : null,
    /\b(?:phone|telephone|mobile|tel)\b/.test(normalized) ? "phone" : null,
    /\b(?:website|web site|url)\b/.test(normalized) ? "url" : null,
  ].filter(Boolean);
  return kinds.length === 1 ? kinds[0] as "email" | "phone" | "url" : null;
}

function parentOf(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function ancestors(element: Element): Element[] {
  const result: Element[] = [];
  for (let current: Element | null = element; current; current = parentOf(current)) result.push(current);
  return result;
}

function rendered(element: Element, requireBox = true, modalScope = true): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  for (const ancestor of ancestors(element)) {
    if (ancestor.matches(`[hidden],[inert],[aria-hidden="true"],${privateRegion}`)) return false;
    const style = getComputedStyle(ancestor);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity || "1") <= 0) return false;
  }
  if (requireBox) {
    const box = element.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return false;
  }
  if (modalScope) {
    const dialogs = [...document.querySelectorAll('dialog[open],[role="dialog"][aria-modal="true"]')].filter(usable);
    if (dialogs.length && !dialogs.some(dialog => dialog.contains(element))) return false;
  }
  return true;
}

function all(selector: string, scope: ParentNode = document): HTMLElement[] {
  const found = [...scope.querySelectorAll(selector)];
  for (const host of scope.querySelectorAll("*"))
    if (host.shadowRoot) found.push(...all(selector, host.shadowRoot));
  return [...new Set(found)].filter((element): element is HTMLElement => element instanceof HTMLElement);
}

/** Reads static label/question text, never an editable node or form value. */
function staticText(element: Element | null, limit = 360, skipChoices = false): string {
  if (!element || element.matches(privateRegion)) return "";
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let result = "";
  let node: Node | null;
  while (result.length < limit && (node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.closest(ignoredText + "," + privateRegion)) continue;
    if (skipChoices && parent.closest('label,[role="radio"],[role="checkbox"]')) continue;
    if (ancestors(parent).some(ancestor => {
      if (ancestor.matches('[hidden],[inert],[aria-hidden="true"]')) return true;
      const style = getComputedStyle(ancestor);
      return style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse";
    })) continue;
    const piece = bounded(node.textContent || "", limit - result.length);
    if (piece) result += (result ? " " : "") + piece;
  }
  return bounded(result, limit);
}

function referencedText(element: Element, attribute: string): string {
  const root = element.getRootNode();
  const ids = (element.getAttribute(attribute) || "").split(/\s+/).filter(Boolean).slice(0, 8);
  return bounded(ids.map(id => {
    const target = root instanceof Document || root instanceof ShadowRoot ? root.getElementById(id) : null;
    return staticText(target);
  }).filter(Boolean).join(" "));
}

function associatedLabel(element: HTMLElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)
    return bounded([...(element.labels || [])].map(label => staticText(label)).filter(Boolean).join(" "));
  return "";
}

function groupContainer(element: HTMLElement, boundary: Element | Document): HTMLElement | null {
  for (const ancestor of ancestors(element).slice(1)) {
    if (ancestor === boundary || ancestor.matches('form,[role="form"]')) break;
    if (!(ancestor instanceof HTMLElement)) continue;
    if (ancestor.matches('fieldset,[role="group"],[role="radiogroup"],[data-params],[data-item-id]')) return ancestor;
    const fields = ancestor.querySelectorAll(controlSelector).length;
    if (fields <= 12 && ancestor.querySelector('legend,label,h1,h2,h3,h4,h5,h6,[role="heading"],[aria-label],[aria-labelledby]')) return ancestor;
  }
  return null;
}

function groupName(group: HTMLElement | null): string {
  if (!group) return "";
  const legend = group.querySelector(":scope > legend");
  const heading = group.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]');
  const direct = staticText(legend) || referencedText(group, "aria-labelledby") || group.getAttribute("aria-label") || staticText(heading);
  if (direct) return bounded(direct);
  if (group.matches('[role="radiogroup"]')) {
    const question = ancestors(group).slice(1).find(ancestor =>
      ancestor.matches('[data-params],[data-item-id],[role="group"],fieldset') &&
      !ancestor.matches('form,[role="form"]'));
    if (question instanceof HTMLElement) return groupName(question);
  }
  return bounded(staticText(group, 360, true));
}

function questionName(group: HTMLElement | null): string {
  if (!group) return "";
  if (group.matches('fieldset,[role="group"],[role="radiogroup"],[data-params],[data-item-id]')) return groupName(group);
  return group.querySelectorAll(controlSelector).length === 1 ? groupName(group) : "";
}

function controlName(element: HTMLElement, group: HTMLElement | null): string {
  return bounded(
    associatedLabel(element) ||
    referencedText(element, "aria-labelledby") ||
    element.getAttribute("aria-label") ||
    (element.matches('[role="checkbox"],[role="radio"]') ? staticText(element) : "") ||
    staticText(element.closest("fieldset")?.querySelector("legend") || null) ||
    questionName(group) ||
    element.getAttribute("placeholder") ||
    "",
  );
}

function optionName(element: HTMLElement): string {
  return bounded(associatedLabel(element) || referencedText(element, "aria-labelledby") ||
    element.getAttribute("aria-label") || staticText(element));
}

function sectionRoot(element: HTMLElement, boundary: Element | Document): HTMLElement | null {
  for (const ancestor of ancestors(element).slice(1)) {
    if (ancestor === boundary) break;
    if (ancestor.matches('section,[role="region"],[data-section-id]') && ancestor instanceof HTMLElement)
      return ancestor;
  }
  return null;
}

function sectionName(element: HTMLElement, boundary: Element | Document): string {
  const section = sectionRoot(element, boundary);
  return section ? bounded(referencedText(section, "aria-labelledby") || section.getAttribute("aria-label") ||
    staticText(section.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]')) || "") : "";
}

function classify(element: HTMLElement, members: readonly HTMLElement[], name: string, group: HTMLElement | null, formName: string): FormSensitivity {
  const descriptors = [...members, element, ...(group ? [group] : [])].map(item => [
    item.getAttribute("type"), item.getAttribute("autocomplete"), item.getAttribute("name"), item.id,
    item.getAttribute("aria-label"), item.getAttribute("placeholder"), item.getAttribute("title"),
    referencedText(item, "aria-labelledby"), referencedText(item, "aria-describedby"),
  ].filter(Boolean).join(" "));
  const questionContext = group ? staticText(group, 1000) : "";
  const ancestorContext = ancestors(element).slice(1).filter(ancestor =>
    ancestor.matches('section,[role="region"],[data-section-id],fieldset,[role="group"],[data-params],[data-item-id]'))
    .map(ancestor => [
      referencedText(ancestor, "aria-labelledby"), ancestor.getAttribute("aria-label"),
      referencedText(ancestor, "aria-describedby"), ancestor.getAttribute("title"),
      staticText(ancestor.querySelector('legend,h1,h2,h3,h4,h5,h6,[role="heading"]')),
    ].filter(Boolean).join(" "));
  const context = semanticText([name, questionContext, formName, ...descriptors, ...ancestorContext].join(" "));
  if (sensitivePatterns.some(pattern => pattern.test(context)) || /^(?:pan|nhs|nino)$/i.test(name.trim()))
    return { status: "blocked", reason: "sensitive" };
  const labelKind = contactKind(name);
  const metadata = [...members, element].flatMap(item => [
    item.getAttribute("autocomplete") || "", item.getAttribute("name") || "",
    item instanceof HTMLInputElement ? item.type : "",
  ]);
  if (labelKind && metadata.some(value => contactKind(value) && contactKind(value) !== labelKind))
    return { status: "blocked", reason: "uncertain" };
  const clarification = semanticText([groupName(group), ...ancestorContext].join(" "));
  const meaning = semanticText([name, clarification].join(" "));
  if (/\b(?:history|conditions?|screening|test results?|records?)\b/i.test(meaning) &&
      !/\b(?:employment|work|job|education|school|academic|exam|quiz|order|purchase|travel|project|product|item|shipping|weather|terms|road|browser|search)\b/i.test(meaning))
    return { status: "blocked", reason: "uncertain" };
  const qualified = clarification.toLowerCase().includes(name.toLowerCase()) && clarification.length > name.length + 2;
  const unclearName = unqualifiedName.test(name) ? !qualified :
    vagueName.test(name) && (!clarification || vagueName.test(clarification) || clarification.toLowerCase() === name.toLowerCase());
  if (!name || unclearName || questionContext.length >= 1000 || context.length >= 2400)
    return { status: "blocked", reason: "uncertain" };
  return { status: "safe" };
}

function inputType(element: HTMLElement): FormControlType | null {
  if (element.getAttribute("role") === "combobox") return "combobox";
  if (element.getAttribute("role") === "radio") return "radio-group";
  if (element.getAttribute("role") === "checkbox") return "checkbox";
  if (element instanceof HTMLTextAreaElement) return "textarea";
  if (element instanceof HTMLSelectElement) return "select";
  if (!(element instanceof HTMLInputElement)) return null;
  if (element.type === "radio") return "radio-group";
  if (element.type === "checkbox") return "checkbox";
  if (element.type === "password") return "unsupported";
  if (["text", "email", "tel", "url", "number", "search", "date", "time", "datetime-local", "month", "week"].includes(element.type))
    return element.type as FormControlType;
  return null;
}

function isDisabled(element: HTMLElement): boolean {
  return element.matches(':disabled,[aria-disabled="true"]') || ancestors(element).some(ancestor => ancestor.matches('[aria-disabled="true"]'));
}

function isReadOnly(element: HTMLElement): boolean {
  return element.matches('[readonly],[aria-readonly="true"]') || ancestors(element).some(ancestor => ancestor.matches('[aria-readonly="true"]'));
}

function isRequired(element: HTMLElement): boolean {
  return element.matches('[required],[aria-required="true"]') || ancestors(element).some(ancestor => ancestor.matches('[aria-required="true"]'));
}

function completed(element: HTMLElement, type: FormControlType, members: readonly HTMLElement[]): boolean {
  if (type === "radio-group") return members.some(member => member instanceof HTMLInputElement ? member.checked : member.getAttribute("aria-checked") === "true");
  if (type === "checkbox") return element instanceof HTMLInputElement ? element.checked : element.getAttribute("aria-checked") === "true";
  if (type === "select" && element instanceof HTMLSelectElement) return Boolean(element.value);
  if (type === "combobox") {
    if (element instanceof HTMLInputElement) return Boolean(element.value.trim());
    return Boolean(element.getAttribute("aria-valuetext") || element.getAttribute("aria-valuenow") || element.getAttribute("aria-activedescendant"));
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return Boolean(element.value.trim());
  return false;
}

function digest(parts: readonly string[]): string {
  let hash = 2166136261;
  for (const character of parts.join("\u001f")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function availableOption(option: HTMLElement): boolean {
  for (const ancestor of ancestors(option)) {
    if (ancestor.matches('[hidden],[aria-hidden="true"]')) return false;
    const style = getComputedStyle(ancestor);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    if (ancestor instanceof HTMLSelectElement) break;
  }
  return true;
}

function nativeSubmit(element: HTMLElement): boolean {
  return element instanceof HTMLButtonElement ? element.type === "submit" :
    element instanceof HTMLInputElement && (element.type === "submit" || element.type === "image");
}

function submitCandidates(scope: ParentNode = document): HTMLElement[] {
  return all('button,input[type="submit"],input[type="image"],[role="button"]', scope)
    .filter(element => nativeSubmit(element) || element.getAttribute("role") === "button")
    .filter(element => rendered(element));
}

function fallbackGroup(elements: readonly HTMLElement[]): boolean {
  if (elements.length === 1) return true;
  const shared = ancestors(elements[0]).find(ancestor => elements.every(element => ancestors(element).includes(ancestor)));
  return shared instanceof HTMLElement && shared.matches('fieldset,[role="group"],[role="radiogroup"]') && !!groupName(shared);
}

const documentId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class FormModel {
  private ids = new WeakMap<object, string>();
  private sequence = 0;
  private current: FormInventory = { documentId, signature: "", forms: [] };
  private controls = new Map<string, FormControl>();

  private id(object: object): string {
    let id = this.ids.get(object);
    if (!id) {
      id = `${documentId}:${++this.sequence}`;
      this.ids.set(object, id);
    }
    return id;
  }

  discover(): FormInventory { return this.refresh(); }

  control(id: string): FormControl | undefined {
    const control = this.controls.get(id);
    return control?.element.isConnected ? control : undefined;
  }

  refresh(): FormInventory {
    const candidates = all(controlSelector).filter(element => rendered(element)).filter(element => inputType(element) !== null);
    const roots = all('form,[role="form"]').filter(root => rendered(root, false, false));
    const buckets = new Map<HTMLElement | Document, HTMLElement[]>();
    for (const root of roots) buckets.set(root, []);
    const unrooted: HTMLElement[] = [];
    for (const candidate of candidates) {
      const nativeForm = "form" in candidate ? (candidate as HTMLInputElement).form : null;
      const root: HTMLElement | undefined = nativeForm && buckets.has(nativeForm) ? nativeForm
        : ancestors(candidate).find((ancestor): ancestor is HTMLElement => ancestor instanceof HTMLElement && buckets.has(ancestor));
      if (root) buckets.get(root)?.push(candidate);
      else unrooted.push(candidate);
    }
    // A shared <main> can contain unrelated widgets; it is not form evidence.
    if (!roots.length && unrooted.length && fallbackGroup(unrooted)) buckets.set(document, unrooted);

    const nextControls = new Map<string, FormControl>();
    const forms: FormEntry[] = [];
    for (const [root, elements] of buckets) {
      if (!elements.length) continue;
      const formId = this.id(root);
      const name = root instanceof Document ? bounded(document.title) : bounded(
        referencedText(root, "aria-labelledby") || root.getAttribute("aria-label") ||
        staticText(root.querySelector('legend,h1,h2,h3,h4,h5,h6,[role="heading"]')) ||
        root.getAttribute("name") || "Form",
      );
      const seen = new Set<HTMLElement>();
      const controls: FormControl[] = [];
      for (const element of elements) {
        if (seen.has(element)) continue;
        const type = inputType(element);
        if (!type) continue;
        let members: HTMLElement[] = [element];
        let group = groupContainer(element, root);
        if (type === "radio-group") {
          const radioRoot = ancestors(element).find(ancestor => ancestor.matches('[role="radiogroup"],fieldset'));
          if (radioRoot instanceof HTMLElement && radioRoot !== root) group = radioRoot;
          if (element instanceof HTMLInputElement && element.name)
            members = elements.filter(other => other instanceof HTMLInputElement && other.type === "radio" && other.name === element.name && (group ? group.contains(other) : true));
          else if (element.getAttribute("role") === "radio" && group) {
            const radioGroup = group;
            members = elements.filter(other => other.getAttribute("role") === "radio" && radioGroup.contains(other));
          }
          members = members.filter(member => !seen.has(member));
        }
        for (const member of members) seen.add(member);
        const controlElement = type === "radio-group" && group?.matches('[role="radiogroup"]') ? group : element;
        const label = type === "radio-group" ? groupName(group) : controlName(element, group);
        if (!label) continue;
        const optionElements = type === "select" && element instanceof HTMLSelectElement
          ? [...element.options]
          : type === "radio-group" ? members
          : type === "combobox" ? (() => {
              const ids = [element.getAttribute("aria-controls"), element.getAttribute("aria-owns")].filter(Boolean);
              const tree = element.getRootNode();
              const node = ids.flatMap(value => value!.split(/\s+/)).map(id =>
                tree instanceof Document || tree instanceof ShadowRoot ? tree.getElementById(id) : null).find(Boolean);
              return node ? all('[role="option"]', node) : [];
            })() : [];
        const options = optionElements.filter(option => type === "select" ? availableOption(option) : rendered(option)).slice(0, 100).map(option => ({
          id: this.id(option), label: bounded(type === "radio-group" ? optionName(option) : option instanceof HTMLOptionElement ? option.label : staticText(option) || option.getAttribute("aria-label") || ""),
          element: option, disabled: isDisabled(option),
        })).filter(option => option.label);
        const sensitivity = classify(controlElement, members, label, group, name);
        const control: FormControl = {
          id: this.id(controlElement), formId, element: controlElement, members, name: label, type,
          required: members.some(isRequired) || isRequired(controlElement),
          disabled: members.every(isDisabled) || isDisabled(controlElement),
          readOnly: members.every(isReadOnly) || isReadOnly(controlElement),
          completed: completed(element, type, members), options, sensitivity,
          section: sectionName(element, root), supported: type !== "unsupported" && sensitivity.status === "safe" && !members.every(isDisabled) && !members.every(isReadOnly),
        };
        controls.push(control);
        nextControls.set(control.id, control);
      }
      if (!controls.length) continue;
      const rootShape = root instanceof HTMLFormElement
        ? [root.getAttribute("action") || "", root.getAttribute("method") || "", root.getAttribute("target") || ""]
        : [root instanceof Document ? "document" : root.getAttribute("role") || ""];
      const submitShape = submitCandidates()
        .filter(element => root instanceof Document ? true : root instanceof HTMLFormElement
          ? ((element instanceof HTMLButtonElement || element instanceof HTMLInputElement) && element.form === root) ||
            (element.getAttribute("role") === "button" && root.contains(element))
          : root.contains(element))
        .flatMap(element => [this.id(element), element.getAttribute("type") || "", element.getAttribute("aria-label") || staticText(element),
          element.getAttribute("formaction") || "", element.getAttribute("formmethod") || "", element.getAttribute("formtarget") || "",
          String(element.hasAttribute("formnovalidate")), String(isDisabled(element))]);
      const signature = digest([formId, name, ...rootShape, ...submitShape, ...controls.flatMap(control => [
        control.id, control.name, control.type, control.section,
        this.id(sectionRoot(control.element, root) || root),
        String(control.required), String(control.disabled), String(control.readOnly),
        control.sensitivity.status, control.sensitivity.status === "blocked" ? control.sensitivity.reason : "",
        ...control.options.flatMap(option => [option.id, option.label, String(option.disabled)]),
      ])]);
      forms.push({ id: formId, root, name, controls, signature });
    }
    const signature = digest([location.href, document.baseURI, ...forms.flatMap(form => [form.id, form.signature])]);
    this.controls = nextControls;
    this.current = { documentId, signature, forms };
    return this.current;
  }
}
