import { overlayId, usable } from "./dom";
import type { FormCommand } from "../shared";

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
  /\b(?:epileps(?:y|ies)|seizures?|migraines?|headaches?|dementia|alzheimer'?s?|parkinson'?s?|multiple[ -]?sclerosis|depression|anxiety|bipolar|schizophrenia|ptsd|adhd|autism|copd|bronchitis|emphysema|apn(?:ea|oea)|arthritis|autoimmune|lupus|eczema|psoriasis|chemotherapy|metastasis|tuberculosis|covid(?:[ -]?19)?|crohn'?s?|irritable[ -]?bowel|celiac|coeliac|ulcers?|thyroid|cirrhosis|endometriosis|infertility|fertility[ -]?treatment)\b/i,
  /\b(?:heart[ -]?attack|myocardial[ -]?infarction|heart[ -]?failure|arrhythmia|angina|pneumonia|narcolepsy|insomnia|anorexia|bulimia|osteoporosis|fibromyalgia|gout|anemia|anaemia|sickle[ -]?cell|hemophilia|haemophilia|leukemia|leukaemia|lymphoma|melanoma|meningitis|sepsis|polio|measles|mumps|rubella|malaria|dengue|cholera|dyslexia|syndromes?|disorders?|lesions?|fractures?|concussions?|injuries|pain|bleeding|nausea|vomiting|fever|fatigue|dizziness|cough|dosage|doses?|vitals?|pulse|oxygen[ -]?(?:level|saturation)|body[ -]?(?:weight|temperature))\b/i,
];
const vagueName = /^(?:other|answer|response|field|input|text|select|choose|option|yes|no|please specify|untitled|id|identifier|number|code|reference|details?|information|history|status|condition|date|expiry|expiration|secret|confidential|sensitive|identity|personal (?:details|information|data)|(?:please )?(?:enter|describe|specify)(?: here)?|additional (?:details|information)|question\s*\d+)(?:\s*\d+)?$/i;
const ordinarySingleName = /^(?:name|firstname|lastname|surname|email|e-mail|phone|telephone|mobile|website|url|address|street|city|state|province|country|postcode|zipcode|zip|postal|company|employer|organization|occupation|job|position|title|department|school|university|college|age|time|quantity|color|colour|size|comments?|feedback|message|notes?|subject|event|location|preference|hobby|username|description)$/i;
// A missing sensitive keyword is not evidence of safety. Recognize bounded ordinary
// meanings explicitly; unfamiliar labels remain uncertain even inside a named group.
const ordinaryMeaningPatterns = [
  /^(?:(?:first|middle|last|full|given|family|preferred|display|legal|contact|user) )?name$/i,
  /^(?:(?:work|home|personal|alternate|alternative|contact) )?(?:e mail|email)(?: address)?$/i,
  /^(?:(?:work|home|personal|alternate|alternative|contact|mobile|cell) )?(?:phone|telephone|mobile|cell)(?: number)?$/i,
  /^(?:website(?: url| address)?|web site(?: url| address)?|url|country code|dialing code|dialling code)$/i,
  /^(?:(?:mailing|shipping|billing|delivery|home|work|street|postal) )?address(?: line [12])?$/i,
  /^(?:(?:shipping|billing|delivery|home|work) )?(?:street(?: address| name| number)?|city|town|state|province|region|country|zip(?: code)?|postal code|post code)$/i,
  /^(?:company|employer|organization|organisation|business|department|school|university|college)(?: name| address| website| location)?$/i,
  /^(?:job title|position title|professional title|job role|employment status|employment type|work experience|years of experience|student year|graduation (?:year|date)|course(?: name)?|major|degree|academic (?:grade|score)|exam (?:grade|score))$/i,
  /^(?:employment|work|job|education|school|academic|order|purchase|travel|project|browser|search) history$/i,
  /^(?:student|employee|customer|order|product|item|project|booking|reservation|shipment|tracking) (?:id|identifier|number|code|reference|status|details|information|date)$/i,
  /^(?:product|item|shipping|weather|road) condition$/i,
  /^(?:event|meeting|appointment|reservation|booking|travel|arrival|departure|delivery|start|end) (?:name|title|date|time|location|details)$/i,
  /^(?:date of birth|birth date|birthdate|birthday|age|time zone|timezone)$/i,
  /^(?:(?:favorite|favourite|preferred) )?(?:color|colour|size|language|hobby|hobbies|interests|sport|movie|music|food|book)$/i,
  /^(?:contact|communication|delivery|shipping) (?:method|preference|preferences|instructions|details|information)$/i,
  /^(?:(?:additional|other|your|general) )?(?:comments|feedback|message|notes|description|suggestions)$/i,
  /^(?:message subject|subject line|search(?: query| terms)?|quantity|number of (?:items|tickets|guests|attendees)|terms and conditions|terms of (?:use|service)|newsletter(?: subscription)?|marketing consent)$/i,
];

function bounded(value: string, length = 180): string {
  return value.replace(/\s+/g, " ").trim().slice(0, length);
}

/** Attribute names often carry meaning as camelCase, snake_case, or kebab-case. */
function semanticText(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_./-]+/g, " ").replace(/\s+/g, " ").trim();
}

function meaningText(value: string): string {
  let meaning = semanticText(value).toLowerCase();
  let previous: string;
  // Prompts can stack framing words and punctuation ("Please, enter your ...").
  // Remove only known framing at the edges; preserve unknown content for the
  // ordinary-meaning allowlist and inspect the original text for sensitivity.
  do {
    previous = meaning;
    meaning = meaning
      .replace(/^[\s:;,!?*–—]+|[\s:;,!?*–—]+$/g, "")
      .replace(/\s*\((?:required|optional)\)$/, "").trim()
      .replace(/^(?:(?:please|kindly|enter|provide|select|choose|describe|specify|your|the|a|an)\b|what (?:is|are)\b)[\s:;,!?–—]*/, "")
      .trim();
  } while (meaning !== previous);
  return meaning;
}

function comparableMeaning(value: string): string {
  const meaning = meaningText(value);
  // Reconcile conventional name aliases without merging distinct name parts
  // or qualifiers such as legal, preferred, contact, and company names.
  if (meaning === "full name") return "name";
  if (meaning === "firstname" || meaning === "given name") return "first name";
  if (meaning === "lastname" || meaning === "surname" || meaning === "family name") return "last name";
  return meaning;
}

function ordinaryMeaning(value: string): boolean {
  const meaning = meaningText(value);
  return ordinarySingleName.test(meaning) || ordinaryMeaningPatterns.some(pattern => pattern.test(meaning));
}

function contactKind(value: string): "email" | "phone" | "url" | "conflicting" | null {
  const normalized = semanticText(value).toLowerCase();
  const kinds = [
    /\b(?:email|e mail)\b/.test(normalized) ? "email" : null,
    /\b(?:phone|telephone|mobile|tel)\b/.test(normalized) ? "phone" : null,
    /\b(?:website|web site|url)\b/.test(normalized) ? "url" : null,
  ].filter(Boolean);
  return kinds.length > 1 ? "conflicting" : kinds.length === 1 ? kinds[0] as "email" | "phone" | "url" : null;
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
  const metadataKinds = metadata.map(contactKind).filter(Boolean);
  // Radio member labels name choices, so compare the group's question names.
  const namingElement = element.matches('input[type="radio"],[role="radio"]') ? group : element;
  const explicitNames = namingElement ? [associatedLabel(namingElement), referencedText(namingElement, "aria-labelledby"), namingElement.getAttribute("aria-label") || ""].filter(Boolean) : [];
  const explicitKinds = explicitNames.map(contactKind).filter(Boolean);
  const typedKind = element instanceof HTMLInputElement ? contactKind(element.type) : null;
  if (labelKind === "conflicting" || metadataKinds.includes("conflicting") || explicitKinds.includes("conflicting") ||
      (labelKind && [...metadataKinds, ...explicitKinds].some(kind => kind !== labelKind)) ||
      (typedKind && typedKind !== labelKind) ||
      (!labelKind && explicitKinds.length > 0))
    return { status: "blocked", reason: "uncertain" };
  const normalizedName = semanticText(name).toLowerCase();
  // Context can qualify a vague label only when it states a recognized ordinary
  // meaning containing that label (e.g. "Number" in "Order number"). Generic
  // headings and unrelated ordinary fields cannot clarify an unknown label.
  const clarifications = [groupName(group), ...ancestorContext].map(semanticText);
  const qualified = vagueName.test(name) && clarifications.some(value => {
    const words = value.toLowerCase().split(/\s+/);
    const labelWords = normalizedName.split(/\s+/);
    const mentionsLabel = words.some((_, index) => labelWords.every((word, offset) => words[index + offset] === word));
    return mentionsLabel && ordinaryMeaning(value);
  });
  if (!name || (!ordinaryMeaning(name) && !qualified) ||
      explicitNames.some(value => comparableMeaning(value) !== comparableMeaning(name) &&
        (!ordinaryMeaning(value) || !labelKind || contactKind(value) !== labelKind)) ||
      questionContext.length >= 1000 || context.length >= 2400)
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
    return Boolean(element.getAttribute("aria-valuetext") || element.getAttribute("aria-valuenow"));
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
  for (let ancestor: Element | null = shared || null; ancestor; ancestor = parentOf(ancestor)) {
    if (!(ancestor instanceof HTMLElement) || ancestor.matches('html,body')) break;
    if (ancestor.matches('main,[role="main"]')) continue;
    if (!ancestor.matches('fieldset,[role="group"],[role="radiogroup"]')) continue;
    const heading = ancestor.querySelector(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6,:scope > [role="heading"],:scope > header > h1,:scope > header > h2,:scope > header > h3,:scope > header > h4,:scope > header > h5,:scope > header > h6');
    const name = referencedText(ancestor, "aria-labelledby") || ancestor.getAttribute("aria-label") ||
      staticText(ancestor.querySelector(':scope > legend')) || staticText(heading);
    if (bounded(name || "") && !/^(?:group|form|section|untitled)$/i.test(bounded(name || ""))) return true;
  }
  return false;
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

type FormChoice =
  | { kind: "form"; formId: string }
  | { kind: "field"; formId: string; controlId: string }
  | { kind: "option"; formId: string; controlId: string; optionId: string };
type PendingFormSubmit = { formId: string; signature: string; button: HTMLElement; buttonSignature: string; url: string; expires: number };
export interface FormResult {
  ok: boolean;
  feedback: string;
  dictationTarget?: HTMLElement;
  dictating?: boolean;
}

function speechKey(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Executes explicit form commands locally. Answer values remain in this content script. */
export class FormAssistant {
  private model = new FormModel();
  private selectedFormId: string | null = null;
  private choices: FormChoice[] = [];
  private choiceSignature = "";
  private pending: PendingFormSubmit | null = null;

  get ownsChoices() { return this.choices.length > 0; }
  get hasPendingConfirmation() { return this.pending !== null; }
  private clearChoices() { this.choices = []; this.choiceSignature = ""; }
  private result(feedback: string, ok = true): FormResult { return { ok, feedback }; }
  private signature(button: HTMLElement) {
    return [button.tagName, button.getAttribute("type"), button.getAttribute("aria-label"), button.textContent, button.getAttribute("disabled"), button.getAttribute("aria-disabled")].join("|");
  }
  private selected(inventory: FormInventory) {
    return this.selectedFormId ? inventory.forms.filter(form => form.id === this.selectedFormId) : inventory.forms;
  }
  private remember(inventory: FormInventory, choices: FormChoice[]) {
    this.choices = choices.slice(0, 10);
    this.choiceSignature = inventory.signature;
  }
  onMutation() {
    if (!this.choices.length && !this.pending) return;
    const inventory = this.model.refresh();
    if (this.choices.length && inventory.signature !== this.choiceSignature) this.clearChoices();
    if (this.pending) {
      const form = inventory.forms.find(item => item.id === this.pending?.formId);
      if (!form || form.signature !== this.pending.signature || !this.pending.button.isConnected || this.signature(this.pending.button) !== this.pending.buttonSignature) this.pending = null;
    }
  }
  pageChanged() {
    this.model = new FormModel();
    this.selectedFormId = null;
    this.pending = null;
    this.clearChoices();
  }
  cancel() { this.pending = null; this.clearChoices(); }
  onUserEdit() { this.pending = null; }
  private formsFor(query: string, inventory: FormInventory) {
    const key = speechKey(query);
    const exact = inventory.forms.filter(form => speechKey(form.name) === key);
    return exact.length ? exact : inventory.forms.filter(form => speechKey(form.name).includes(key) || key.includes(speechKey(form.name)));
  }
  private fieldsFor(forms: readonly FormEntry[], query: string) {
    const key = speechKey(query);
    const controls = forms.flatMap(form => form.controls).filter(control => control.supported && control.sensitivity.status === "safe");
    const exact = controls.filter(control => speechKey(control.name) === key);
    return exact.length ? exact : controls.filter(control => speechKey(control.name).includes(key) || key.includes(speechKey(control.name)));
  }
  private selectForm(form: FormEntry) {
    this.selectedFormId = form.id;
    this.clearChoices();
    return this.result("Selected " + form.name + ".");
  }
  private currentControl(inventory: FormInventory, id: string) {
    const control = this.model.control(id);
    const form = inventory.forms.find(entry => entry.id === control?.formId);
    return form && control?.element.isConnected && control.supported && control.sensitivity.status === "safe" && !control.disabled && !control.readOnly ? control : undefined;
  }
  private ambiguousFields(inventory: FormInventory, controls: FormControl[]) {
    this.remember(inventory, controls.map(control => ({ kind: "field", formId: control.formId, controlId: control.id })));
    const options = controls.slice(0, 10).map((control, index) => (index + 1) + ": " + control.name).join(". ");
    return this.result("Several fields match. " + options + ". Say choose followed by the number, then repeat the field command.");
  }
  private setValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
    const proto = element instanceof HTMLInputElement ? HTMLInputElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (!setter) return false;
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return element.value === value;
  }
  private write(control: FormControl, value: string) {
    const element = control.element;
    if (!element.isConnected || control.sensitivity.status !== "safe" || control.disabled || control.readOnly) return false;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return false;
    if (element instanceof HTMLInputElement && !["text", "email", "tel", "url", "number", "search", "date", "time", "datetime-local", "month", "week"].includes(element.type)) return false;
    if (element instanceof HTMLInputElement && element.type === "number" && value && !Number.isFinite(Number(value))) return false;
    if (!this.setValue(element, value)) return false;
    return !value || element.checkValidity();
  }
  private async activateOption(control: FormControl, option: FormOption) {
    if (option.disabled || !option.element.isConnected || control.disabled || control.readOnly || control.sensitivity.status !== "safe") return false;
    if (control.element instanceof HTMLSelectElement && option.element instanceof HTMLOptionElement)
      return this.setValue(control.element, option.element.value) && control.element.selectedOptions[0] === option.element;
    if (control.type === "radio-group" || control.type === "combobox") {
      option.element.click();
      await new Promise(resolve => setTimeout(resolve, 50));
      if (control.type === "radio-group")
        return option.element instanceof HTMLInputElement ? option.element.checked : option.element.getAttribute("aria-checked") === "true";
      this.model.refresh();
      const updated = this.model.control(control.id);
      const activeId = updated?.element.getAttribute("aria-activedescendant");
      const selected = option.element.getAttribute("aria-selected") === "true" || activeId === option.element.id;
      const value = updated?.element instanceof HTMLInputElement ? updated.element.value : updated?.element.getAttribute("aria-valuetext");
      return selected || speechKey(value || "") === speechKey(option.label);
    }
    return false;
  }
  private async selectOption(control: FormControl, query: string) {
    let current = control;
    let found = current.options.filter(option => !option.disabled && speechKey(option.label) === speechKey(query));
    if (!found.length && current.type === "combobox") {
      current.element.click();
      await new Promise(resolve => setTimeout(resolve, 100));
      this.model.refresh();
      current = this.model.control(control.id) || current;
      found = current.options.filter(option => !option.disabled && speechKey(option.label) === speechKey(query));
    }
    return found.length === 1 ? this.activateOption(current, found[0]) : false;
  }
  private submitButtons(form: FormEntry) {
    return all('button,input[type="submit"],input[type="image"],[role="button"]', form.root)
      .filter(button => rendered(button) && !isDisabled(button))
      .filter(button => {
        const label = speechKey(button instanceof HTMLInputElement ? button.value : (button.getAttribute("aria-label") || "") + " " + staticText(button));
        return /\b(submit|send|finish|complete|submit form|send response)\b/.test(label) && (nativeSubmit(button) || button.getAttribute("role") === "button");
      });
  }
  private invalid(control: FormControl) {
    const element = control.element;
    if (element.getAttribute("aria-invalid") === "true") return true;
    return (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) && !element.validity.valid;
  }
  private prepareSubmit(inventory: FormInventory): FormResult {
    const forms = this.selected(inventory);
    if (forms.length !== 1) {
      if (forms.length > 1) {
        this.remember(inventory, forms.map(form => ({ kind: "form", formId: form.id })));
        return this.result("Several forms are available. " + forms.map((form, index) => (index + 1) + ": " + form.name).join(". ") + ". Say choose followed by the number.");
      }
      return this.result("No supported form was found.", false);
    }
    const buttons = this.submitButtons(forms[0]);
    if (buttons.length !== 1) return this.result(buttons.length ? "Several possible submit buttons were found; I will not guess." : "No safe submit button was found.", false);
    const button = buttons[0];
    this.pending = { formId: forms[0].id, signature: forms[0].signature, button, buttonSignature: this.signature(button), url: location.href, expires: Date.now() + 15000 };
    const incomplete = forms[0].controls.filter(field => field.required && !field.completed && field.sensitivity.status === "safe").length;
    const blocked = forms[0].controls.filter(field => field.required && (!field.supported || field.sensitivity.status !== "safe")).length;
    const summary = (incomplete ? incomplete + " required field" + (incomplete === 1 ? " is" : "s are") + " incomplete. " : "All visible safe required fields appear complete. ") +
      (blocked ? blocked + " protected or unsupported required field" + (blocked === 1 ? " needs" : "s need") + " manual review. " : "");
    return this.result("Ready to submit " + forms[0].name + ". " + summary + "Say confirm within 15 seconds, or cancel.");
  }
  async confirm(): Promise<FormResult | null> {
    const pending = this.pending;
    if (!pending) return null;
    this.pending = null;
    const inventory = this.model.refresh();
    const form = inventory.forms.find(entry => entry.id === pending.formId);
    if (Date.now() > pending.expires || location.href !== pending.url || !form || form.signature !== pending.signature || !pending.button.isConnected || isDisabled(pending.button) || this.signature(pending.button) !== pending.buttonSignature)
      return this.result("The form changed or confirmation expired. Nothing was submitted.", false);
    pending.button.click();
    await new Promise(resolve => setTimeout(resolve, 350));
    const submitted = /\b(response (?:has been )?recorded|successfully submitted|thank you for (?:your )?response|your response has been recorded|form submitted)\b/i.test(staticText(document.body, 2400));
    return this.result(submitted ? "The page indicates the form was submitted." : "The submit action ran once, but I could not verify the result. I will not retry automatically.", submitted);
  }
  async handle(command: FormCommand): Promise<FormResult> {
    if (this.pending && command.type !== "submit") this.pending = null;
    const inventory = this.model.refresh();
    if (this.choices.length && this.choiceSignature !== inventory.signature) this.clearChoices();
    if (command.type === "choose") {
      const choice = this.choices[command.index - 1];
      this.clearChoices();
      if (!choice) return this.result("That form choice expired. List the forms or fields again.", false);
      if (choice.kind === "form") {
        const form = inventory.forms.find(item => item.id === choice.formId);
        return form ? this.selectForm(form) : this.result("That form is no longer available.", false);
      }
      const field = this.currentControl(inventory, choice.controlId);
      if (!field) return this.result("That field is no longer available or safe to edit.", false);
      if (choice.kind === "option") {
        const option = field.options.find(item => item.id === choice.optionId);
        if (!option || option.disabled) return this.result("That option is no longer available.", false);
        const ok = await this.activateOption(field, option);
        return this.result(ok ? "Selected " + option.label + " for " + field.name + "." : "That option could not be selected safely.", ok);
      }
      this.selectedFormId = field.formId;
      return this.result("Selected " + field.name + ". Repeat the command for this field.");
    }
    if (command.type === "list-forms" || command.type === "select-form") {
      const forms = command.type === "list-forms" ? inventory.forms : "index" in command ? [inventory.forms[command.index - 1]].filter((form): form is FormEntry => !!form) : this.formsFor(command.query, inventory);
      if (!forms.length) return this.result("No matching supported form was found.", false);
      if (forms.length === 1) return this.selectForm(forms[0]);
      this.remember(inventory, forms.map(form => ({ kind: "form", formId: form.id })));
      return this.result("Forms: " + forms.map((form, index) => (index + 1) + ": " + form.name).join(". ") + ". Say choose followed by the number.");
    }
    if (command.type === "submit") return this.prepareSubmit(inventory);
    if (["list-fields", "list-required", "missing", "review"].includes(command.type)) {
      const forms = this.selected(inventory);
      if (forms.length !== 1) return this.result(forms.length ? "Select one form first." : "No supported form was found. Sensitive and unclear fields are excluded.", false);
      const safe = forms[0].controls.filter(field => field.supported && field.sensitivity.status === "safe");
      const list = command.type === "list-required" ? safe.filter(field => field.required)
        : command.type === "missing" ? safe.filter(field => field.required && !field.completed || this.invalid(field))
        : safe;
      if (!list.length) return this.result(command.type === "missing" ? "No required fields appear to be missing." : "No matching safe fields were found.");
      this.remember(inventory, list.map(field => ({ kind: "field", formId: field.formId, controlId: field.id })));
      return this.result((command.type === "missing" ? "Missing or invalid fields: " : command.type === "review" ? "Form review: " : "") + list.map((field, index) => (index + 1) + ": " + field.name + " (" + field.type + ")" + (field.required ? " (required)" : "") + (this.invalid(field) ? " (invalid)" : field.completed ? " (filled)" : command.type === "review" ? " (empty)" : command.type === "missing" ? " (missing)" : "")).join(". ") + ".");
    }
    if (command.type === "next-section" || command.type === "previous-section") {
      const forms = this.selected(inventory);
      if (forms.length !== 1) return this.result("Select one form before moving sections.", false);
      const names = command.type === "next-section" ? ["next", "continue", "next section"] : ["previous", "back", "previous section"];
      const buttons = all('button,[role="button"],input[type="button"],input[type="submit"]', forms[0].root).filter(button => rendered(button) && !isDisabled(button)).filter(button => names.includes(speechKey(button instanceof HTMLInputElement ? button.value : (button.getAttribute("aria-label") || "") + " " + staticText(button))));
      if (buttons.length !== 1) return this.result(buttons.length ? "Several section controls match; I will not guess." : "No matching section control was found.", false);
      buttons[0].click();
      this.clearChoices();
      await new Promise(resolve => setTimeout(resolve, 150));
      this.model.refresh();
      return this.result("Section control activated. Review the displayed section before continuing.");
    }
    if (!("query" in command)) return this.result("That form command is unsupported.", false);
    const forms = this.selected(inventory);
    if (!forms.length) return this.result("No supported form was found. Sensitive and unclear fields are excluded.", false);
    const fields = this.fieldsFor(forms, command.query);
    if (!fields.length) return this.result("No safe, clearly labelled field matched that name.", false);
    if (fields.length > 1) return this.ambiguousFields(inventory, fields);
    const field = this.currentControl(inventory, fields[0].id);
    if (!field) return this.result("That field is disabled, read-only, sensitive, or unavailable.", false);
    this.clearChoices();
    if (command.type === "dictate") {
      field.element.focus({ preventScroll: true });
      this.selectedFormId = field.formId;
      return { ...this.result("Ready to dictate into " + field.name + ". Say stop typing to finish."), dictationTarget: field.element, dictating: true };
    }
    if (command.type === "select-option") {
      const matches = field.options.filter(option => !option.disabled && speechKey(option.label) === speechKey(command.option));
      if (matches.length > 1) {
        this.remember(inventory, matches.map(option => ({ kind: "option", formId: field.formId, controlId: field.id, optionId: option.id })));
        return this.result("Several options match " + field.name + ". " + matches.map((option, index) => (index + 1) + ": " + option.label).join(". ") + ". Say choose followed by the number.");
      }
      if (!matches.length && field.type !== "combobox") return this.result("That exact option was not found.", false);
      const ok = await this.selectOption(field, command.option);
      return this.result(ok ? "Selected " + command.option + " for " + field.name + "." : "That field type could not select and verify the requested option.", ok);
    }
    if (command.type === "check" || command.type === "uncheck") {
      if (field.type !== "checkbox") return this.result(field.name + " is not a checkbox.", false);
      const element = field.element;
      const desired = command.type === "check";
      const checked = element instanceof HTMLInputElement ? element.checked : element.getAttribute("aria-checked") === "true";
      if (checked !== desired) element.click();
      const result = element instanceof HTMLInputElement ? element.checked : element.getAttribute("aria-checked") === "true";
      return this.result(result === desired ? (desired ? "Checked " : "Unchecked ") + field.name + "." : "Could not verify " + field.name + ".", result === desired);
    }
    if (command.type === "fill" || command.type === "change" || command.type === "clear") {
      const ok = this.write(field, command.type === "clear" ? "" : command.value);
      return this.result(ok ? (command.type === "clear" ? "Cleared " : "Filled ") + field.name + "." : "Could not safely set " + field.name + "; check its format and constraints.", ok);
    }
    return this.result("That form command is unsupported.", false);
  }
}
