import {
  prepareGroupB,
  executeGroupB,
  groupBSends,
  type RecipientAllowed,
} from "./group-b";
import { SiteContext } from "./context";
import { catalogue } from "./catalogue";
import {
  elements,
  controls,
  visible,
  label,
  norm,
  stateOf,
  setInput,
  until,
  editable,
  insertText,
} from "./resolver";
import { numberSlot, isCancellation, validateSiteRequest } from "./language";
import type {
  ActionSpec,
  Entity,
  SiteRequest,
  SiteResult,
  SiteSnapshot,
} from "./types";
const safelyDescribeDestination = (snapshot: SiteSnapshot) =>
  snapshot.site + " " + new URL(snapshot.url).pathname.slice(0, 180);
const result = (
  state: SiteResult["state"],
  feedback: string,
  rest: Partial<SiteResult> = {},
): SiteResult => ({ state, feedback, ...rest });
interface Pending {
  request: SiteRequest;
  preview: string;
  expires: number;
  node?: HTMLElement;
  signature: string;
}
interface Choices {
  request: SiteRequest;
  entities: Entity[];
  offset: number;
  expires: number;
}
/** All site writes pass through this object, including non-form React handlers. */
export class SiteExecutor {
  readonly context: SiteContext;
  private selected: Entity | null = null;
  private selectedRevision = -1;
  private pending: Pending | null = null;
  private choices: Choices | null = null;
  private active = new AbortController();
  private uncertain = new Set<string>();
  private handled = new Map<string, SiteResult>();
  private citationOrigin: HTMLElement | null = null;
  private findQuery = "";
  private matches: HTMLElement[] = [];
  private matchIndex = -1;
  private sectionIndex = -1;
  lastFeedback = "";
  constructor(
    url?: () => string,
    private now: () => number = () => Date.now(),
    private publicationAllowed: () => boolean = () => false,
    private recipientAllowed: RecipientAllowed = () => false,
  ) {
    this.context = new SiteContext(url);
  }
  cancel() {
    this.active.abort();
    this.active = new AbortController();
    this.pending = null;
    this.choices = null;
  }
  invalidate() {
    this.cancel();
    this.context.invalidate();
    this.selected = null;
    this.selectedRevision = -1;
  }
  private fresh(request: SiteRequest) {
    const s = this.context.inspect();
    return (
      !!s &&
      s.site === request.site &&
      s.documentId === request.documentId &&
      s.revision === request.revision
    );
  }
  snapshot(): SiteSnapshot | null {
    const snapshot = this.context.inspect();
    if (snapshot && !this.publicationAllowed())
      snapshot.capabilities = snapshot.capabilities.map((c) =>
        this.context.adapter()?.actions.find((a) => a.id === c.id)?.operation
          .kind === "submit"
          ? { ...c, state: "not-implemented" }
          : c,
      );
    if (snapshot)
      snapshot.capabilities = snapshot.capabilities.map((capability) => {
        if (!groupBSends.has(capability.id)) return capability;
        const spec = this.context
          .adapter()!
          .actions.find((a) => a.id === capability.id)!;
        const roots =
          spec.operation.kind === "group-b" && spec.operation.scope
            ? elements(spec.operation.scope)
            : [document];
        if (roots.length !== 1)
          return {
            ...capability,
            state: roots.length ? "needs-choice" : "unavailable",
          };
        const prepared = prepareGroupB(
          spec,
          {
            type: "site-action",
            site: snapshot.site,
            url: snapshot.url,
            action: spec.id,
            args: {},
            revision: snapshot.revision,
            documentId: snapshot.documentId,
            requestId: "capability",
          },
          snapshot,
          roots[0],
          this.recipientAllowed,
        );
        return {
          ...capability,
          state: prepared.result?.state || "needs-confirmation",
        };
      });
    return snapshot &&
      this.selected &&
      this.selectedRevision === snapshot.revision
      ? { ...snapshot, selected: this.selected }
      : snapshot;
  }
  private identity(request: SiteRequest, snapshot: SiteSnapshot) {
    if (request.entityId)
      return (
        snapshot.entities.find((e) => e.id === request.entityId) ||
        (snapshot.current?.id === request.entityId ? snapshot.current : null)
      );
    return this.selectedRevision === snapshot.revision
      ? this.selected
      : snapshot.current;
  }
  private scope(
    spec: ActionSpec,
    snapshot: SiteSnapshot,
    request: SiteRequest,
  ): ParentNode | null {
    const op = spec.operation;
    if (spec.id === "R07" || (op.kind === "group-b" && !op.scope))
      return document;
    const selector = "scope" in op ? op.scope : undefined;
    if (selector) {
      let roots = elements(selector);
      const selected = this.identity(request, snapshot);
      const selectedNode = selected && this.context.node(selected.id);
      if (selectedNode && roots.length > 1) {
        const bound = roots.filter(
          (root) => root === selectedNode || root.contains(selectedNode),
        );
        if (bound.length === 1) roots = bound;
      }
      if (roots.length > 1 && op.kind === "field") {
        const names = request.args.mode?.includes("title")
          ? ["Title", "Add a title"]
          : request.args.mode?.match(/body|description/)
            ? ["Body", "Description", "Add a description"]
            : op.names;
        roots = roots.filter((root) =>
          elements('input,textarea,[contenteditable="true"]', root).some(
            (e) => editable(e) && names.some((n) => norm(label(e)) === norm(n)),
          ),
        );
      }
      if (roots.length > 1 && op.kind === "submit")
        roots = roots.filter((root) => controls(op.names, root).length === 1);
      if (roots.length > 1)
        roots = roots.filter(
          (root) =>
            !roots.some((other) => other !== root && root.contains(other)),
        );
      return roots.length === 1 ? roots[0] : null;
    }
    if (
      spec.write ||
      ["R09", "R10", "R15", "R20", "X13", "R24", "R25"].includes(spec.id)
    ) {
      const entity = this.identity(request, snapshot);
      if (!entity) return null;
      // Heading/now-playing labels need their enclosing entity, never the entire feed.
      const node = this.context.node(entity.id);
      if (!node) return null;
      return (
        node.closest(
          'shreddit-post,shreddit-comment,article,[data-testid="post-container"],[data-testid="comment"],.previewModal,[data-testid="now-playing-widget"]',
        ) || node
      );
    }
    return document;
  }
  private signature(node?: HTMLElement) {
    return node
      ? JSON.stringify([
          label(node),
          elements("[email],[data-email]").map((e) => [
            e.getAttribute("email"),
            e.getAttribute("data-email"),
          ]),
          node.getAttribute("aria-pressed"),
          node.getAttribute("aria-expanded"),
          node.closest("form")?.textContent,
          [
            ...(
              node.closest("form") ||
              node.parentElement ||
              node
            ).querySelectorAll('input,textarea,[contenteditable="true"]'),
          ].map((e) =>
            e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement
              ? e.value
              : e.textContent,
          ),
        ])
      : "";
  }
  private remember(value: SiteResult) {
    this.lastFeedback = value.feedback;
    return value;
  }
  guardActivation(node: HTMLElement): SiteRequest | "blocked" | null {
    const snapshot = this.context.inspect(),
      adapter = this.context.adapter();
    if (!snapshot || !adapter) return null;
    const name = norm(label(node));
    if (
      snapshot.site === "irctc" &&
      node.closest("app-passenger-input,app-review-booking,app-payment")
    )
      return "blocked";
    for (const spec of adapter.actions) {
      const op = spec.operation;
      if (spec.write && op.kind === "group-b") {
        if ((spec.guardNames || []).some((n) => norm(n) === name))
          return "blocked";
      }
      if (!spec.write || !("names" in op)) continue;
      const names = [...op.names, ...(op.kind === "state" ? op.opposite : [])];
      if (!names.some((n) => norm(n) === name)) continue;
      const entity = snapshot.entities.find((e) =>
        this.context.node(e.id)?.contains(node),
      );
      if (entity) {
        this.selected = entity;
        this.selectedRevision = snapshot.revision;
      }
      return {
        type: "site-action",
        site: snapshot.site,
        url: snapshot.url,
        action: spec.id,
        args: {},
        documentId: snapshot.documentId,
        revision: snapshot.revision,
        requestId: crypto.randomUUID(),
        ...(entity ? { entityId: entity.id } : {}),
      };
    }
    if (
      /\b(like|unlike|upvote|downvote|star|unstar|save|unsave|bookmark|repost|retweet|follow|unfollow|send|post|publish|submit|comment|reply|delete|remove|clear|discard|cart|buy|book|booking|pay|payment|apply|checkout|order|merge|subscribe)\b/.test(
        name,
      ) &&
      !editable(node) &&
      !(node.matches("a[href]") && /^(?:cart|my cart|bookmarks)$/.test(name))
    )
      return "blocked";
    return null;
  }
  async dialogue(text: string): Promise<SiteResult | null> {
    const n = norm(text).replace(/[.!?,]+$/, "");
    if (isCancellation(n)) {
      this.cancel();
      return this.remember(
        result(
          "available",
          "Cancelled the pending request. Completed actions are unchanged.",
        ),
      );
    }
    if (n === "say that again")
      return result(
        "available",
        this.lastFeedback || "There is no previous feedback.",
      );
    if (
      /^(what can i (?:do|say) (?:here|on this page)|help|explain the choices)$/.test(
        n,
      )
    ) {
      const s = this.snapshot();
      if (!s) return null;
      const actions = s.capabilities.filter(
        (a) => a.state !== "not-implemented",
      );
      return this.remember(
        result(
          "available",
          `${s.site}. Available commands depend on visible controls. ${actions
            .slice(0, 5)
            .map((a) => catalogue.find((c) => c.id === a.id)?.examples[0])
            .join(". ")}. Say list results to hear choices.`,
        ),
      );
    }
    if (n === "which item are you talking about")
      return result(
        "available",
        this.pending || this.choices
          ? this.pending?.preview || this.choiceFeedback(this.choices!)
          : this.selected
            ? `Selected ${this.selected.label}.`
            : "No voice target is selected.",
      );
    if (n === "more choices" && this.choices) {
      this.choices.offset += 5;
      return result("needs-choice", this.choiceFeedback(this.choices), {
        choices: this.choices.entities.slice(
          this.choices.offset,
          this.choices.offset + 5,
        ),
      });
    }
    if (/^(?:yes|confirm(?: .+)?)$/.test(n)) {
      if (!this.pending) return null;
      const pending = this.pending;
      this.pending = null;
      if (
        this.now() > pending.expires ||
        !this.fresh(pending.request) ||
        (pending.node &&
          (!visible(pending.node) ||
            this.signature(pending.node) !== pending.signature))
      )
        return this.remember(
          result(
            "unavailable",
            "The confirmation expired or its target changed. Nothing was activated.",
          ),
        );
      return this.run(pending.request, true);
    }
    if (this.choices) {
      const choices = this.choices;
      const indexText = n
        .replace(/^actually[, ]*/, "")
        .replace(/^(?:choose|select|open)(?: number)? /, "")
        .replace(/^the /, "")
        .replace(/ one(?: please)?$/, "")
        .replace(/ please$/, "");
      let index = numberSlot(indexText);
      if (index === null) {
        const query = n.replace(/^(?:choose|select)(?: the one)?(?: by)? /, "");
        const matches = choices.entities.filter(
          (e) =>
            norm(e.label).includes(query) || norm(e.detail).includes(query),
        );
        if (matches.length === 1)
          index = choices.entities.indexOf(matches[0]) + 1;
      }
      if (index !== null) {
        this.choices = null;
        if (this.now() > choices.expires || !this.fresh(choices.request))
          return result(
            "unavailable",
            "Those choices changed. Ask for the results again.",
          );
        const entity = choices.entities[index - 1];
        if (!entity)
          return result(
            "unavailable",
            "That numbered choice is not available.",
          );
        this.selected = entity;
        this.selectedRevision = choices.request.revision;
        return this.run(
          {
            ...choices.request,
            entityId: entity.id,
            args: {
              ...choices.request.args,
              index: undefined,
              query: undefined,
              mode:
                choices.request.args.mode === "list"
                  ? undefined
                  : choices.request.args.mode,
            },
          },
          false,
        );
      }
    }
    if (this.pending) this.pending = null;
    if (
      /^(?:list results|list comments|list chats|list messages|list drafts|list jobs|list trains|list places|list routes)$/.test(
        n,
      )
    ) {
      const s = this.context.inspect();
      if (!s) return null;
      const spec = this.context
        .adapter()!
        .actions.find(
          (a) =>
            a.operation.kind === "entities" &&
            (n === "list results" ||
              a.operation.entity ===
                (
                  {
                    "list comments": "comment",
                    "list chats": "chat",
                    "list messages": "message",
                    "list drafts": "draft",
                    "list jobs": "job",
                    "list trains": "train",
                    "list places": "place",
                    "list routes": "route",
                  } as Record<string, string>
                )[n]),
        );
      if (!spec)
        return result("unavailable", "No result list is available here.");
      return this.run({
        type: "site-action",
        site: s.site,
        url: s.url,
        action: spec.id,
        documentId: s.documentId,
        revision: s.revision,
        requestId: crypto.randomUUID(),
        args: { mode: "list" },
      });
    }
    return null;
  }
  private choiceFeedback(choices: Choices) {
    const batch = choices.entities.slice(choices.offset, choices.offset + 5);
    return batch.length
      ? `Which item? ${batch.map((e, i) => `${choices.offset + i + 1}. ${e.label}${e.detail !== e.label ? ", " + e.detail : ""}`).join(". ")}. Say choose a number, more choices, or cancel.`
      : "No more choices. Say a previously announced number or cancel.";
  }
  async run(raw: SiteRequest, confirmed = false): Promise<SiteResult> {
    let request = validateSiteRequest(raw);
    if (!request)
      return result("unavailable", "Invalid or unsupported site action.");
    const previous = this.handled.get(request.requestId);
    if (previous) return previous;
    const spec = this.context
      .adapter()
      ?.actions.find((a) => a.id === request!.action);
    if (!spec)
      return result("unavailable", "Invalid or unsupported site action.");
    if (!this.fresh(request)) {
      const current = this.context.inspect();
      const canRebaseSpotifyRead =
        request.site === "spotify" &&
        !!request.url &&
        !request.entityId &&
        request.args.index === undefined &&
        !spec?.write &&
        current?.site === request.site &&
        current.documentId === request.documentId &&
        current.url === request.url;
      if (canRebaseSpotifyRead)
        request = { ...request, revision: current.revision };
      else {
        this.cancel();
        return this.remember(
          result(
            "unavailable",
            "The page or target changed. Repeat your request.",
          ),
        );
      }
    }
    const snapshot = this.snapshot()!,
      op = spec.operation;
    const boundEntity = this.identity(request, snapshot);
    if (
      spec.write &&
      op.kind === "state" &&
      snapshot.site === "github" &&
      boundEntity?.kind === "comment"
    )
      return result(
        "not-implemented",
        "Comment reactions are not implemented. Repository stars cannot substitute for them.",
      );
    if (op.kind === "submit" && !this.publicationAllowed())
      return result(
        "not-implemented",
        "Publishing is disabled outside explicitly configured owned test spaces. No content was posted.",
      );
    if (op.kind === "unsupported")
      return this.remember(result("not-implemented", op.reason));
    if (this.pending && this.pending.request.requestId !== request.requestId)
      this.pending = null;
    if (["R09", "R20"].includes(spec.id) && request.args.value !== undefined) {
      const choices = this.choices;
      const chosen = choices?.entities[request.args.value - 1];
      if (
        !choices ||
        this.now() > choices.expires ||
        !this.fresh(choices.request) ||
        chosen?.kind !== "comment"
      ) {
        this.choices = null;
        return result(
          "needs-choice",
          "Say list comments first, then refer to an announced comment number.",
        );
      }
      request.entityId = chosen.id;
      this.choices = null;
    }
    if (this.choices && this.choices.request.requestId !== request.requestId) {
      const ordinal =
        request.args.index ??
        (request.args.query
          ? numberSlot(request.args.query.replace(/^the /, ""))
          : null);
      if (
        op.kind === "entities" &&
        ordinal !== null &&
        ordinal !== undefined &&
        this.now() <= this.choices.expires &&
        this.fresh(this.choices.request)
      ) {
        const chosen = this.choices.entities[ordinal - 1];
        if (!chosen || chosen.kind !== op.entity)
          return result(
            "unavailable",
            "That number is not in the announced list for this object type.",
          );
        request.entityId = chosen.id;
        request.args = {
          ...request.args,
          index: undefined,
          query: undefined,
          mode: request.args.mode === "list" ? undefined : request.args.mode,
        };
      }
      this.choices = null;
    }
    const scope = this.scope(spec, snapshot, request);
    if (!scope)
      return this.remember(
        result(
          "needs-choice",
          "Select a specific item first. Say list results or open a named item.",
        ),
      );
    const signal = this.active.signal;
    const valid = () =>
      !signal.aborted &&
      this.context.inspect()?.documentId === request.documentId &&
      this.context.inspect()?.url === snapshot.url;
    const args = request.args;
    let target: HTMLElement | undefined;
    let groupPreview: string | undefined;
    if (op.kind === "group-b") {
      const prepared = prepareGroupB(
        spec,
        request,
        snapshot,
        scope,
        this.recipientAllowed,
      );
      if (prepared.result) return this.remember(prepared.result);
      target = prepared.target;
      groupPreview = prepared.preview;
    }
    if (op.kind === "state") {
      const matches = controls([...op.names, ...op.opposite], scope);
      if (matches.length !== 1)
        return this.remember(
          result(
            "unavailable",
            matches.length
              ? "Several reaction controls match. Select the exact item first."
              : "The reaction control is unavailable. Sign-in or account access may be required.",
          ),
        );
      target = matches[0];
      const state = stateOf(target, op.opposite, op.names);
      const desired = args.mode?.startsWith("unsave") ? false : op.desired;
      if (state === desired)
        return this.remember(
          result(
            "already-satisfied",
            `${snapshot.current?.label || this.selected?.label || "This item"} is already ${desired ? "saved or liked" : "not saved or liked"}.`,
            { evidence: "desired-state" },
          ),
        );
      if (
        state === null &&
        !op.names.some((n) => norm(n) === norm(label(target!)))
      )
        return result(
          "unavailable",
          "The current reaction state cannot be established.",
        );
    }
    if (op.kind === "submit") {
      const buttons = controls(op.names, scope);
      if (buttons.length !== 1)
        return result(
          "unavailable",
          "A unique publication control is unavailable.",
        );
      target = buttons[0];
      const drafts = elements(
        'input,textarea,[contenteditable="true"]',
        scope,
      ).filter(editable);
      if (
        !drafts.length ||
        !drafts.some((e) =>
          (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement
            ? e.value
            : e.textContent || ""
          ).trim(),
        )
      )
        return result("unavailable", "The scoped draft is empty.");
    }
    if (spec.write && !confirmed) {
      const identity = this.identity(request, snapshot);
      if (
        !identity &&
        op.kind !== "submit" &&
        op.kind !== "clear-draft" &&
        op.kind !== "group-b"
      )
        return result(
          "needs-choice",
          "Which item should change? Select a named item first.",
        );
      if (["R15"].includes(spec.id) && identity?.kind !== "comment")
        return result("needs-choice", "Select a comment before voting on it.");
      const preview = `${groupPreview || catalogue.find((a) => a.id === spec.id)!.description}. Target: ${identity?.label || (scope instanceof HTMLElement ? label(scope) : snapshot.site)} on ${safelyDescribeDestination(snapshot)}. Say confirm within 15 seconds, or cancel.`;
      this.pending = {
        request,
        preview,
        expires: this.now() + 15000,
        node: target,
        signature: this.signature(target),
      };
      return this.remember(result("needs-confirmation", preview));
    }
    const mutationKey = `${spec.id}:${request.entityId || this.selected?.id || snapshot.current?.id}`;
    if (spec.write && this.uncertain.has(mutationKey))
      return result(
        "failed",
        "The previous change has an uncertain outcome. Inspect the item before trying again. It will not be repeated automatically.",
      );
    if (spec.write) this.uncertain.add(mutationKey);
    let output: SiteResult;
    try {
      output = await this.execute(
        spec,
        request,
        snapshot,
        scope,
        target,
        valid,
      );
    } catch (error) {
      output = result(
        "failed",
        error instanceof Error ? error.message : "The page interaction failed.",
      );
    }
    if (!valid())
      output = result(
        "failed",
        "The action was cancelled or the page changed. Its result was not verified.",
      );
    if (spec.write && ["available", "already-satisfied"].includes(output.state))
      this.uncertain.delete(mutationKey);
    if (spec.write || output.state === "available") {
      this.handled.set(request.requestId, output);
      if (this.handled.size > 100)
        this.handled.delete(this.handled.keys().next().value!);
    }
    const updated = this.context.inspect();
    if (output.state === "needs-choice" && output.choices?.length && updated) {
      this.choices = {
        request: { ...request, revision: updated.revision },
        entities: output.choices,
        offset: 0,
        expires: this.now() + 30000,
      };
      output.feedback = this.choiceFeedback(this.choices);
    }
    if (
      updated &&
      this.selected &&
      updated.entities.some((e) => e.id === this.selected!.id)
    )
      this.selectedRevision = updated.revision;
    return this.remember(output);
  }
  private async execute(
    spec: ActionSpec,
    request: SiteRequest,
    s: SiteSnapshot,
    scope: ParentNode,
    target: HTMLElement | undefined,
    valid: () => boolean,
  ): Promise<SiteResult> {
    const op = spec.operation,
      a = request.args;
    const verified = async (check: () => boolean, message: string) =>
      (await until(check, valid))
        ? result("available", message, { evidence: "observed-postcondition" })
        : result(
            "failed",
            "The control was activated, but its result could not be verified. No automatic retry.",
          );
    if (op.kind === "group-b")
      return executeGroupB(
        spec,
        request,
        s,
        scope,
        target,
        valid,
        this.context,
      );
    if (op.kind === "search" || op.kind === "route") {
      const url = new URL(s.url),
        parts = url.pathname.split("/").filter(Boolean),
        repo = parts.slice(0, 2).join("/");
      if (
        s.site === "github" &&
        (!repo || parts.length < 2) &&
        ("path" in op ? op.path : op.url).includes("{repo}")
      )
        return result(
          "unavailable",
          "Open a repository before using this command.",
        );
      let path = op.kind === "search" ? op.url : op.path;
      const replacements: Record<string, string> = {
        query: encodeURIComponent(a.query || ""),
        repo,
        community: parts[0] === "r" ? parts[1] || "" : "",
        value: String(a.value ?? ""),
        mode: a.mode === "pull requests" ? "pulls" : a.mode || "",
        parent:
          parts.length > 4 ? "/" + parts.slice(0, -1).join("/") : "/" + repo,
      };
      if (path.includes("{community}") && !replacements.community)
        return result("unavailable", "Open a community first.");
      if (
        (path.includes("{query}") && !a.query) ||
        (path.includes("{value}") &&
          (!Number.isInteger(a.value) || a.value! < 1))
      )
        return result("unavailable", "Provide a valid query or number.");
      path = path.replace(/\{(\w+)\}/g, (_, key) => replacements[key] || "");
      return result("available", "Opening the requested destination.", {
        navigate: { url: new URL(path, s.url).href, newTab: false },
      });
    }
    if (spec.id === "WA01" && a.query && !request.entityId) {
      const inputs = elements(
        '#side [contenteditable="true"][role="textbox"],#pane-side input[aria-label="Search chats"],#side input[aria-label="Search chats"],#side [aria-label="Search input textbox"]',
      );
      if (inputs.length !== 1 || !editable(inputs[0]))
        return result(
          "unavailable",
          "The chat-search field is unavailable. Only rendered chats can be selected here.",
        );
      const input = inputs[0];
      input.focus();
      if (input instanceof HTMLInputElement) setInput(input, a.query);
      else {
        const range = document.createRange();
        range.selectNodeContents(input);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
        insertText(input, a.query);
      }
      let signature = "",
        stableSince = performance.now();
      const started = stableSince;
      const settled = await until(() => {
        const chats =
          this.context.inspect()?.entities.filter((e) => e.kind === "chat") ||
          [];
        const next = chats.map((e) => e.id + ":" + e.label).join("|");
        if (next !== signature) {
          signature = next;
          stableSince = performance.now();
        }
        return (
          performance.now() - started >= 400 &&
          performance.now() - stableSince >= 200 &&
          !elements('#side [aria-busy="true"],#pane-side [aria-busy="true"]')
            .length &&
          chats.some((e) => norm(e.label).includes(norm(a.query!)))
        );
      }, valid);
      if (!settled)
        return result(
          "unavailable",
          "The chat search did not settle. No chat was opened.",
        );
      const refreshed = this.context.inspect();
      if (!valid() || !refreshed)
        return result("unavailable", "The chat-search request was cancelled.");
      s = refreshed;
      request = { ...request, revision: refreshed.revision };
    }
    if (spec.id === "G08") {
      const query = a.query;
      if (!query) return result("unavailable", "Name a file to find.");
      const available = s.entities.filter(
        (e) => e.kind === "file" && norm(e.label).includes(norm(query)),
      );
      if (!available.length) {
        const openers = controls(["Go to file"]);
        if (openers.length !== 1)
          return result(
            "unavailable",
            "The repository file finder is unavailable. Only rendered files can be selected here.",
          );
        openers[0].click();
        await until(
          () =>
            elements(
              '[role="dialog"] input,input[aria-label="Go to file"]',
            ).filter(editable).length === 1,
          valid,
        );
        const fields = elements(
          '[role="dialog"] input,input[aria-label="Go to file"]',
        ).filter(editable);
        if (fields.length !== 1)
          return result(
            "unavailable",
            "The file finder input is unavailable or ambiguous.",
          );
        setInput(fields[0] as HTMLInputElement, query);
        await until(
          () =>
            !!this.context
              .inspect()
              ?.entities.some(
                (e) => e.kind === "file" && norm(e.label).includes(norm(query)),
              ),
          valid,
        );
        const refreshed = this.context.inspect();
        if (!valid() || !refreshed)
          return result(
            "unavailable",
            "The repository changed while finding the file.",
          );
        s = refreshed;
        request = { ...request, revision: refreshed.revision };
      }
    }
    if (op.kind === "entities") {
      let candidates = s.entities.filter((e) => e.kind === op.entity);
      if (a.mode === "list") {
        if (!candidates.length)
          return result(
            "unavailable",
            "No visible results are available here.",
          );
        this.choices = {
          request,
          entities: candidates,
          offset: 0,
          expires: this.now() + 30000,
        };
        return result("needs-choice", this.choiceFeedback(this.choices), {
          choices: candidates.slice(0, 5),
        });
      }
      let chosen = request.entityId
        ? candidates.find((e) => e.id === request.entityId)
        : undefined;
      if (!chosen && a.index !== undefined) {
        // Ordinals require the list that was actually announced.
        if (!this.choices || !this.fresh(this.choices.request))
          return result(
            "needs-choice",
            "Ask to list results first, then choose a number.",
          );
        chosen = this.choices.entities[a.index - 1];
      }
      if (!chosen && a.query) {
        const q = norm(a.query).replace(/^the /, "");
        const ordinal = numberSlot(q);
        if (ordinal !== null)
          return result(
            "needs-choice",
            "Say list results first so the numbers refer to an announced list.",
          );
        const tokens = q
          .split(/\s+/)
          .filter((word) => !["a", "an", "the", "by"].includes(word));
        candidates = candidates.filter(
          (e) =>
            tokens.length > 0 &&
            tokens.every((token) =>
              norm(e.label + " " + e.detail).includes(token),
            ),
        );
      }
      if (op.selectOnly && a.mode && !chosen) {
        const at = candidates.findIndex((e) => e.id === this.selected?.id);
        chosen = candidates[at + (a.mode.startsWith("previous") ? -1 : 1)];
      }
      if (
        !chosen &&
        !a.query &&
        this.selectedRevision === s.revision &&
        this.selected?.kind === op.entity
      )
        chosen = this.selected;
      if (!chosen && candidates.length === 1) chosen = candidates[0];
      if (!chosen) {
        if (!candidates.length)
          return result(
            "unavailable",
            "No matching visible item is available.",
          );
        this.choices = {
          request,
          entities: candidates,
          offset: 0,
          expires: this.now() + 30000,
        };
        return result("needs-choice", this.choiceFeedback(this.choices), {
          choices: candidates.slice(0, 5),
        });
      }
      const node = this.context.node(chosen.id);
      if (!node)
        return result("unavailable", "That item is no longer available.");
      this.selected = chosen;
      this.selectedRevision = s.revision;
      node.scrollIntoView({ block: "center" });
      if (op.selectOnly || a.mode === "select")
        return result("available", `Selected ${chosen.label}.`, {
          evidence: chosen.id,
        });
      if (
        chosen.href &&
        !["track", "profile", "episode"].includes(chosen.kind)
      ) {
        const url = new URL(chosen.href);
        if (!["https:", "http:"].includes(url.protocol))
          return result("unavailable", "That link scheme is unsupported.");
        return result("available", `Opening ${chosen.label}.`, {
          navigate: { url: url.href, newTab: spec.id === "W09" },
        });
      }
      if (["chat", "thread", "train", "route"].includes(chosen.kind)) {
        if (chosen.kind === "train")
          return result("available", `Selected train ${chosen.label}.`, {
            evidence: chosen.id,
          });
        if (chosen.kind === "route" && !request.entityId)
          return result(
            "needs-choice",
            "Say list routes, then choose an announced number. Fastest is not inferred from an unqualified route list.",
          );
        node.click();
        return verified(
          () =>
            chosen.kind === "route"
              ? stateOf(node, []) === true
              : chosen.kind === "thread"
                ? !node.isConnected && !!this.context.inspect()?.current
                : norm(this.context.inspect()?.current?.label || "") ===
                  norm(chosen.label),
          `Opened ${chosen.label}.`,
        );
      }
      if (chosen.kind === "draft") {
        node.focus();
        return result("available", `Selected draft ${chosen.label}.`, {
          evidence: chosen.id,
        });
      }
      const player = node.querySelector<HTMLElement>(
        'button[aria-label^="Play"],button[data-testid="play-button"]',
      );
      (player || node).click();
      return verified(() => {
        if (chosen.kind === "profile")
          return !node.isConnected && !elements(".profile-link").length;
        const current = this.context.inspect()?.current;
        const same = chosen.href
          ? current?.href === chosen.href
          : !!current && norm(current.label) === norm(chosen.label);
        return (
          same &&
          elements("video,audio").some(
            (e) => e instanceof HTMLMediaElement && !e.paused,
          )
        );
      }, `Opened ${chosen.label}.`);
    }
    if (op.kind === "sections") {
      const sections = s.entities.filter((e) => e.kind === "section");
      if (!sections.length)
        return result("unavailable", "No article sections are available.");
      this.choices = {
        request: { ...request, action: "W04" },
        entities: sections,
        offset: 0,
        expires: this.now() + 30000,
      };
      return result("needs-choice", this.choiceFeedback(this.choices), {
        choices: sections.slice(0, 5),
      });
    }
    if (
      op.kind === "section" ||
      op.kind === "introduction" ||
      op.kind === "section-next" ||
      op.kind === "section-previous" ||
      op.kind === "reference"
    ) {
      let nodes: HTMLElement[] = [];
      if (op.kind === "introduction") nodes = elements("#firstHeading");
      else if (op.kind === "reference") {
        const n = a.value;
        if (!Number.isInteger(n) || n! < 1 || n! > 10000)
          return result("unavailable", "Provide a valid reference number.");
        nodes = elements(`.references li[id]`).filter((_, i) => i === n! - 1);
        this.citationOrigin = elements(`a[href="#${nodes[0]?.id}"]`)[0] || null;
      } else if (spec.id === "G19")
        nodes = elements(`[id="L${a.value}"],[data-line-number="${a.value}"]`);
      else if (s.site === "amazon") {
        const selector = (
          {
            A11: "#productDetails_feature_div,#prodDetails",
            A12: "#customerReviews",
            A24: "#deliveryBlockMessage",
          } as Record<string, string>
        )[spec.id];
        if (selector) nodes = elements(selector);
      } else {
        const sections = s.entities.filter((e) => e.kind === "section");
        let entity = request.entityId
          ? sections.find((e) => e.id === request.entityId)
          : undefined;
        if (op.kind === "section-next" || op.kind === "section-previous") {
          this.sectionIndex += a.mode?.startsWith("previous") ? -1 : 1;
          entity = sections[this.sectionIndex];
        }
        if (!entity && a.query) {
          const matches = sections.filter(
            (e) => norm(e.label) === norm(a.query!),
          );
          if (matches.length === 1) entity = matches[0];
          else if (matches.length > 1) {
            this.choices = {
              request,
              entities: matches,
              offset: 0,
              expires: this.now() + 30000,
            };
            return result("needs-choice", this.choiceFeedback(this.choices), {
              choices: matches.slice(0, 5),
            });
          }
        }
        if (entity) {
          this.sectionIndex = sections.indexOf(entity);
          const node = this.context.node(entity.id);
          if (node) nodes = [node];
        }
        if (spec.id === "W16") nodes = elements(".infobox");
      }
      if (nodes.length !== 1)
        return result(
          "unavailable",
          "That section or reference is absent or ambiguous.",
        );
      nodes[0].scrollIntoView({ block: "start", behavior: "instant" });
      return verified(
        () => {
          const r = nodes[0].getBoundingClientRect();
          return r.top >= -10 && r.top < innerHeight;
        },
        `At ${label(nodes[0]) || "the requested section"}.`,
      );
    }
    if (op.kind === "reference-return") {
      if (!this.citationOrigin?.isConnected)
        return result("unavailable", "No citation origin is recorded.");
      this.citationOrigin.scrollIntoView({ block: "center" });
      return result("available", "Returned to the citation sentence.", {
        evidence: this.citationOrigin.id,
      });
    }
    if (op.kind === "find") {
      this.findQuery = a.query || "";
      this.matches = elements("#mw-content-text p,#mw-content-text li").filter(
        (e) => norm(e.textContent || "").includes(norm(this.findQuery)),
      );
      this.matchIndex = -1;
      return result(
        "available",
        `${this.matches.length} matching paragraphs. Say next match.`,
        { evidence: String(this.matches.length) },
      );
    }
    if (op.kind === "find-next" || op.kind === "find-previous") {
      if (!this.matches.length)
        return result("unavailable", "Find a term in this article first.");
      this.matchIndex =
        (this.matchIndex +
          (a.mode?.startsWith("previous") ? -1 : 1) +
          this.matches.length) %
        this.matches.length;
      const node = this.matches[this.matchIndex];
      if (!node.isConnected)
        return result(
          "unavailable",
          "The article changed. Find the term again.",
        );
      node.scrollIntoView({ block: "center" });
      return result(
        "available",
        `Match ${this.matchIndex + 1} of ${this.matches.length}.`,
        { evidence: this.findQuery },
      );
    }
    if (op.kind === "info") {
      if (s.site === "amazon") {
        const product = s.current;
        if (!product)
          return result("unavailable", "Open a unique product first.");
        const selected = elements(
          '#twister .selection,#twister [aria-pressed="true"],#twister [aria-checked="true"],#twister_feature_div .selection',
        ).map(label);
        const price = elements(
          "#corePrice_feature_div .a-price .a-offscreen,#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
        ).map(label);
        const availability = elements("#availability").map(label);
        return result(
          "available",
          `${product.label}. Variant: ${selected.join(", ") || "not exposed by this page"}. Displayed price: ${price[0] || "unavailable"}. ${availability.join(" ")}`,
          { evidence: product.id },
        );
      }
      const info = s.current;
      if (!info)
        return result(
          "unavailable",
          "The current item is ambiguous or unavailable.",
        );
      return result(
        "available",
        `Current ${info.kind}: ${info.label}. ${info.detail !== info.label ? info.detail : ""}`,
        { evidence: info.id },
      );
    }
    if (op.kind === "state") {
      const desired = a.mode?.startsWith("unsave") ? false : op.desired;
      if (!target || !visible(target))
        return result("unavailable", "The reaction control changed.");
      target.click();
      return verified(() => {
        const candidates = controls([...op.names, ...op.opposite], scope);
        return (
          candidates.length === 1 &&
          stateOf(candidates[0], op.opposite, op.names) === desired
        );
      }, "Verified the requested saved or reaction state.");
    }
    if (op.kind === "field") {
      const desired = a.mode?.match(/title/)
        ? ["Title", "Add a title"]
        : a.mode?.match(/body|description/)
          ? ["Body", "Description", "Add a description"]
          : op.names;
      const fields = elements(
        'input,textarea,[contenteditable="true"]',
        scope,
      ).filter(
        (e) => editable(e) && desired.some((n) => norm(label(e)) === norm(n)),
      );
      if (fields.length !== 1)
        return result(
          "unavailable",
          "A unique named editable field is unavailable. Protected fields are blocked.",
        );
      fields[0].focus();
      return result(
        "available",
        `Dictating into ${label(fields[0])}. Say finish dictation to exit. Say literal finish dictation to insert those words.`,
        { focusField: true, evidence: label(fields[0]) },
      );
    }
    if (op.kind === "clear-draft") {
      const drafts = elements(
        'input,textarea,[contenteditable="true"]',
        scope,
      ).filter(editable);
      if (drafts.length !== 1)
        return result("unavailable", "Select a single draft first.");
      const draft = drafts[0];
      draft.focus();
      if (
        draft instanceof HTMLInputElement ||
        draft instanceof HTMLTextAreaElement
      )
        draft.select();
      else {
        const range = document.createRange();
        range.selectNodeContents(draft);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
      }
      insertText(draft, "");
      return verified(
        () =>
          !(draft instanceof HTMLInputElement ||
          draft instanceof HTMLTextAreaElement
            ? draft.value
            : draft.textContent),
        "Cleared the selected draft.",
      );
    }
    if (op.kind === "submit") {
      if (!target || !visible(target))
        return result("unavailable", "The publication control changed.");
      const before = new Set(elements(op.created));
      target.click();
      // A click or spinner is not publication evidence. Require one new visible object.
      return verified(
        () => elements(op.created).filter((e) => !before.has(e)).length === 1,
        "Exactly one new publication is visible. Check its destination and ownership before live qualification.",
      );
    }
    if (op.kind === "select") {
      const nodes = elements(op.selector).filter(
        (e): e is HTMLSelectElement => e instanceof HTMLSelectElement,
      );
      if (nodes.length !== 1)
        return result(
          "unavailable",
          "The selection control is unavailable or ambiguous.",
        );
      const select = nodes[0],
        query = a.query || String(a.value ?? "");
      const options = [...select.options].filter(
        (o) =>
          !o.disabled &&
          (norm(o.text) === norm(query) ||
            norm(o.value) === norm(query) ||
            norm(o.text) === `season ${query}`),
      );
      if (options.length !== 1)
        return result(
          "unavailable",
          "That option is unavailable. Ask for an option displayed on this page.",
        );
      setInput(select, options[0].value);
      return verified(
        () => select.value === options[0].value,
        `Selected ${options[0].text}.`,
      );
    }
    if (op.kind === "price") {
      if (
        a.value === undefined ||
        a.value < 0 ||
        (a.end !== undefined && a.end < a.value)
      )
        return result("unavailable", "The price range is invalid.");
      const upper = elements(op.upper)[0],
        lower = op.lower ? elements(op.lower)[0] : null;
      const buttons = controls(
        [op.submit],
        elements("#s-refinements")[0] || document,
      );
      if (
        !(upper instanceof HTMLInputElement) ||
        (op.lower && !(lower instanceof HTMLInputElement)) ||
        buttons.length !== 1
      )
        return result(
          "unavailable",
          "This category does not expose the supported price controls.",
        );
      if (lower instanceof HTMLInputElement) setInput(lower, String(a.value));
      setInput(upper, String(a.end ?? a.value));
      const before = s.url;
      buttons[0].click();
      return verified(
        () =>
          location.href !== before &&
          new URL(location.href).search !== new URL(before).search,
        "The price filter changed the results destination.",
      );
    }
    if (spec.id === "G09") {
      const branch = request.args.query;
      if (!branch) return result("unavailable", "Name an available branch.");
      const currentPath = new URL(s.url).pathname.split("/");
      if (
        ["tree", "blob"].includes(currentPath[3]) &&
        decodeURIComponent(currentPath[4] || "") === branch
      )
        return result("already-satisfied", `Already on branch ${branch}.`);
      let choices = controls(
        [branch],
        elements('[role="dialog"],[role="menu"]')[0] || document,
      );
      if (!choices.length) {
        const openers = elements(
          'button[data-hotkey="w"],button[aria-label="Switch branches or tags"],[data-testid="branch-picker-dropdown"]',
        );
        if (openers.length !== 1)
          return result("unavailable", "The branch selector is unavailable.");
        openers[0].click();
        await until(
          () =>
            controls(
              [branch],
              elements('[role="dialog"],[role="menu"]')[0] || document,
            ).length > 0,
          valid,
        );
        choices = controls(
          [branch],
          elements('[role="dialog"],[role="menu"]')[0] || document,
        );
      }
      if (choices.length !== 1)
        return result("unavailable", "That branch is absent or ambiguous.");
      const choice = choices[0];
      if (choice instanceof HTMLAnchorElement) {
        const destination = new URL(choice.href, s.url);
        if (
          destination.hostname !== "github.com" ||
          !destination.pathname.startsWith(
            currentPath.slice(0, 3).join("/") + "/",
          )
        )
          return result(
            "unavailable",
            "The branch link belongs to a different repository.",
          );
        return result("available", `Opening branch ${branch}.`, {
          navigate: { url: destination.href, newTab: false },
        });
      }
      choice.click();
      return verified(
        () =>
          stateOf(choice, []) === true ||
          decodeURIComponent(
            new URL(location.href).pathname.split("/")[4] || "",
          ) === branch,
        `Switched to ${branch}.`,
      );
    }
    if (spec.id === "R07") {
      const [sort, range] = (a.query || "").split(" by ");
      const roots = elements('main,[role="menu"]');
      const root =
        roots.find((e) => e.getAttribute("role") === "menu") || roots[0];
      if (!root || !sort)
        return result("unavailable", "Open the post sorting menu first.");
      const choices = controls([sort], root);
      if (choices.length !== 1)
        return result(
          "unavailable",
          "That post sort is unavailable. Open its menu first.",
        );
      if (stateOf(choices[0], []) !== true) {
        choices[0].click();
        if (!(await until(() => stateOf(choices[0], []) === true, valid)))
          return result(
            "failed",
            "The post sort changed without a verifiable selected state.",
          );
      }
      if (range) {
        const names = {
          today: ["Today", "Past 24 hours"],
          "this week": ["This week", "Past week"],
          "this month": ["This month", "Past month"],
          "all time": ["All time"],
        }[range];
        const ranges = controls(names || [range]);
        if (ranges.length !== 1)
          return result(
            "unavailable",
            "The sort was selected, but the requested time range is unavailable. Open the time range menu.",
          );
        ranges[0].click();
        return verified(
          () => stateOf(ranges[0], []) === true,
          `Sorted posts by ${sort}, ${range}.`,
        );
      }
      return result("available", `Sorted posts by ${sort}.`, {
        evidence: "selected-sort",
      });
    }
    if (op.kind === "control") {
      let names = op.names;
      if (a.query) names = [a.query];
      if (spec.id === "G14")
        names = [a.mode === "conversation" ? "Conversation" : "Files changed"];
      let matches = controls(names, scope);
      if (matches.length !== 1)
        return result(
          "unavailable",
          "That control is missing, disabled or ambiguous. Open its menu explicitly if needed.",
        );
      const node = matches[0],
        before = s.current?.id,
        expanded = node.getAttribute("aria-expanded"),
        url = location.href;
      if (op.verify === "selected" && stateOf(node, []) === true)
        return result(
          "already-satisfied",
          `${label(node)} is already selected.`,
        );
      node.click();
      return verified(
        () =>
          op.verify === "closed"
            ? !visible(node)
            : op.verify === "selected"
              ? stateOf(node, []) === true
              : op.verify === "expanded"
                ? node.getAttribute("aria-expanded") !== expanded ||
                  !!elements('[role="dialog"],[role="menu"],textarea').length
                : location.href !== url ||
                  this.context.inspect()?.current?.id !== before,
        `Verified ${names[0]}.`,
      );
    }
    if (spec.id === "S05") {
      if (!/^\/(?:album|playlist)\//.test(new URL(s.url).pathname))
        return result(
          "needs-choice",
          "Open the album or playlist first. Resuming the previous track would not start that collection.",
        );
      const main = elements("main")[0],
        players = elements("audio,video").filter(
          (e): e is HTMLMediaElement => e instanceof HTMLMediaElement,
        );
      const buttons = main ? controls(["Play"], main) : [];
      if (buttons.length !== 1 || players.length !== 1)
        return result(
          "unavailable",
          "The collection player cannot be verified on this page.",
        );
      const trackHrefs = s.entities
        .filter((e) => e.kind === "track")
        .map((e) => e.href);
      buttons[0].click();
      return verified(
        () =>
          !players[0].paused &&
          trackHrefs.includes(this.context.inspect()?.current?.href),
        "Playing a track from the current collection.",
      );
    }
    if (op.kind === "media")
      return this.media(op.command, request, scope, valid);
    if (op.kind === "back") {
      history.back();
      return result(
        "available",
        "Returning through browser history. Verify the destination after it loads.",
        { evidence: "history-request" },
      );
    }
    return result(
      "not-implemented",
      "This action has no execution path in this version.",
    );
  }
  private async media(
    command: string,
    request: SiteRequest,
    scope: ParentNode,
    valid: () => boolean,
  ): Promise<SiteResult> {
    const a = request.args;
    if (a.mode?.startsWith("pause")) command = "pause";
    if (a.mode?.startsWith("restart")) command = "restart";
    const players = elements("video,audio", scope).filter(
      (e): e is HTMLMediaElement => e instanceof HTMLMediaElement,
    );
    const player = players.length === 1 ? players[0] : null;
    if (!player) {
      if (["play", "pause", "next", "previous"].includes(command)) {
        const names = (
          {
            play: ["Play"],
            pause: ["Pause"],
            next: ["Next", "Next episode"],
            previous: ["Previous"],
          } as Record<string, string[]>
        )[command];
        const buttons = controls(names);
        if (buttons.length === 1) {
          const before = this.context.inspect()?.current?.id;
          buttons[0].click();
          return (await until(
            () =>
              command === "play"
                ? controls(["Pause"]).length === 1
                : command === "pause"
                  ? controls(["Play"]).length === 1
                  : this.context.inspect()?.current?.id !== before,
            valid,
          ))
            ? result(
                "failed",
                "The player control changed, but actual playback could not be verified. No automatic retry.",
                { evidence: "player-ui-state" },
              )
            : result("failed", "Player state could not be verified.");
        }
      }
      return result(
        "unavailable",
        "No unique supported player is accessible. Account restrictions or DRM may prevent this control.",
      );
    }
    if (command === "pause") {
      player.pause();
      return !player.paused
        ? result("failed", "Playback did not pause.")
        : result("available", "Playback paused.", {
            evidence: "media.paused=true",
          });
    }
    if (command === "play") {
      await player.play();
      return player.paused
        ? result("failed", "Playback did not start.")
        : result("available", "Playback resumed.", {
            evidence: "media.paused=false",
          });
    }
    if (command === "mute") {
      const desired = !a.mode?.startsWith("unmute");
      player.muted = desired;
      return result(
        "available",
        desired ? "Player muted." : "Player unmuted.",
        { evidence: `muted=${player.muted}` },
      );
    }
    if (command === "volume" || command === "volume-relative") {
      if (
        a.value === undefined ||
        Math.abs(a.value) > 100 ||
        (command === "volume" && a.value < 0)
      )
        return result(
          "unavailable",
          "Volume must be between zero and one hundred percent.",
        );
      player.volume = Math.max(
        0,
        Math.min(
          1,
          command === "volume" ? a.value / 100 : player.volume + a.value / 100,
        ),
      );
      return result(
        "available",
        `Player volume ${Math.round(player.volume * 100)} percent.`,
        { evidence: String(player.volume) },
      );
    }
    if (["seek", "seek-absolute", "restart"].includes(command)) {
      if (!Number.isFinite(player.duration) || player.duration <= 0)
        return result("unavailable", "Seeking is unavailable for this stream.");
      if (
        command !== "restart" &&
        (a.value === undefined ||
          !Number.isFinite(a.value) ||
          (command === "seek" && Math.abs(a.value) > 600) ||
          (command === "seek-absolute" && a.value < 0))
      )
        return result("unavailable", "Provide a valid bounded time.");
      const requested =
        command === "restart"
          ? 0
          : command === "seek"
            ? player.currentTime + a.value!
            : a.value!;
      if (requested < 0 || requested > player.duration)
        return result("unavailable", "That position is outside this title.");
      player.currentTime = requested;
      return (await until(
        () => !player.seeking && Math.abs(player.currentTime - requested) < 1.5,
        valid,
      ))
        ? result("available", `Playback at ${Math.round(requested)} seconds.`, {
            evidence: String(player.currentTime),
          })
        : result("failed", "Seeking could not be verified.");
    }
    const before = this.context.inspect()?.current?.id;
    const buttons = controls(
      command === "next" ? ["Next", "Next episode"] : ["Previous"],
    );
    if (buttons.length !== 1)
      return result(
        "unavailable",
        "Track or episode switching is unavailable.",
      );
    buttons[0].click();
    return (await until(
      () => this.context.inspect()?.current?.id !== before,
      valid,
    ))
      ? result("available", "The current track or episode changed.", {
          evidence: "entity-change",
        })
      : result(
          "failed",
          "The requested track or episode change could not be verified.",
        );
  }
}
