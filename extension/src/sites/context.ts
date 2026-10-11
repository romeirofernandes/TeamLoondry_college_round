import { catalogue, siteForUrl } from "./catalogue";
import { adapters } from "./registry";
import { elements, label, visible, controls } from "./resolver";
import type { Adapter, Entity, EntityKind, SiteSnapshot } from "./types";
/** Per-document identities are never restored from storage. Reused labels cannot revive a request. */
export class SiteContext {
  readonly documentId = crypto.randomUUID();
  revision = 0;
  private signature = "";
  private ids = new WeakMap<Element, { id: string; key: string }>();
  private nodes = new Map<string, HTMLElement>();
  private counter = 0;
  private dirty = true;
  private observer: MutationObserver | null = null;
  private lastInspectedUrl = "";
  private cachedSnapshot: SiteSnapshot | null = null;
  private readonly markDirty = () => {
    this.dirty = true;
  };
  constructor(private url: () => string = () => location.href) {
    if (typeof document === "undefined" || typeof window === "undefined")
      return;
    if (document.documentElement && typeof MutationObserver !== "undefined") {
      const observer = this.observer = new MutationObserver(this.markDirty);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          "aria-label",
          "aria-hidden",
          "aria-pressed",
          "aria-selected",
          "aria-expanded",
          "href",
          "title",
          "role",
          "contenteditable",
          "placeholder",
          "disabled",
          "class",
          "style",
          "data-testid",
          "data-id",
          "data-chat-id",
          "data-asin",
          "data-job-id",
          "data-train-number",
          "data-meeting-title",
        ],
      });
    }
    document.addEventListener("input", this.markDirty, true);
    document.addEventListener("change", this.markDirty, true);
    window.addEventListener("scroll", this.markDirty, true);
    window.addEventListener("resize", this.markDirty, true);
  }
  node(id: string): HTMLElement | undefined {
    const e = this.nodes.get(id);
    return e?.isConnected && visible(e) ? e : undefined;
  }
  invalidate() {
    this.revision++;
    this.signature = "";
    this.dirty = true;
  }
  inspect(): SiteSnapshot | null {
    if (this.observer?.takeRecords().length) this.dirty = true;
    const url = this.url(),
      site = siteForUrl(url);
    if (!this.dirty && this.lastInspectedUrl === url)
      return this.cachedSnapshot;
    if (!site) {
      this.nodes.clear();
      this.lastInspectedUrl = url;
      this.cachedSnapshot = null;
      this.dirty = false;
      return null;
    }
    const adapter = adapters[site],
      entities: Entity[] = [];
    this.nodes.clear();
    const inViewport = (node: HTMLElement) => {
      const rect = node.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth
      );
    };
    const visualOrder = (nodes: HTMLElement[]) =>
      nodes
        .filter(inViewport)
        .sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return Math.abs(ar.top - br.top) > 24
            ? ar.top - br.top
            : ar.left - br.left;
        });
    const make = (node: HTMLElement, kind: EntityKind): Entity => {
      const link =
        node instanceof HTMLAnchorElement
          ? node
          : (kind === "video"
              ? node.querySelector<HTMLAnchorElement>('a[href*="/watch"]')
              : null) || node.querySelector<HTMLAnchorElement>(
              'a[href*="/status/"],a[href*="/comments/"],a[href*="/track/"]',
            ) || node.querySelector<HTMLAnchorElement>("a[href]");
      const href =
        ["section", "reference"].includes(kind) && node.id
          ? new URL("#" + node.id, url).href
          : link
            ? new URL(link.getAttribute("href")!, url).href
            : undefined;
      const chatIds =
        site === "whatsapp" &&
        kind === "chat" &&
        !node.closest("#pane-side,#side")
          ? [
              ...new Set(
                [
                  elements("#main[data-chat-id],#main [data-chat-id]").map(
                    (e) => e.getAttribute("data-chat-id") || "",
                  ),
                  elements("#main [data-id]").map(
                    (e) =>
                      /^(?:true|false)_([^_]+)_[^]+$/.exec(
                        e.getAttribute("data-id") || "",
                      )?.[1] || "",
                  ),
                ]
                  .flat()
                  .filter(Boolean),
              ),
            ]
          : [];
      const identity =
        chatIds.length === 1 && !node.closest("#pane-side,#side")
          ? chatIds[0]
          : undefined;
      const title =
        (site === "youtube" && kind === "video"
          ? node.querySelector<HTMLElement>(
              "#video-title, a#video-title, h3",
            )?.getAttribute("title") ||
            node.querySelector<HTMLElement>(
              "#video-title, a#video-title, h3",
            )?.textContent
          : undefined) ||
        node.getAttribute("post-title") ||
        (site === "whatsapp" && kind === "chat" && node.closest("#pane-side,#side")
          ? node
              .querySelector<HTMLElement>(
                '[data-testid="cell-frame-title"] [title],span[title]',
              )
              ?.getAttribute("title")
          : undefined) ||
        (site === "gmail" && kind === "thread"
          ? node.querySelector<HTMLElement>(".bog")?.textContent
          : undefined) ||
        node.querySelector<HTMLElement>(
          'h1,h2,h3,[data-testid="tweetText"],[data-testid="track-name"]',
        )?.textContent ||
        label(node);
      const key = JSON.stringify([
        kind,
        href,
        title,
        node.getAttribute("data-asin"),
        node.getAttribute("post-id"),
        identity,
        node.getAttribute("data-id"),
        node.getAttribute("data-job-id"),
        node.getAttribute("data-train-number"),
        node.getAttribute("data-meeting-title"),
      ]);
      let stored = this.ids.get(node);
      if (!stored || stored.key !== key) {
        stored = { id: `${site}:${++this.counter}`, key };
        this.ids.set(node, stored);
      }
      const id = stored.id;
      this.nodes.set(id, node);
      return {
        id,
        kind,
        label: title.trim().slice(0, 180),
        ...(identity ? { identity } : {}),
        detail: (
          (site === "youtube" && kind === "video"
            ? node.querySelector<HTMLElement>(
                "#channel-name a, ytd-channel-name a, .ytd-channel-name a",
              )?.textContent || ""
            : label(node)) +
          (href && ["file", "folder", "repository"].includes(kind)
            ? " " + new URL(href).pathname
            : "")
        ).slice(0, 240),
        ...(href ? { href } : {}),
      };
    };
    for (const [kind, selector] of Object.entries(adapter.entities)) {
      const seen = new Set<string>();
      let kindCount = 0;
      const found = elements(selector!);
      const ordered = site === "youtube" && kind === "video"
        ? visualOrder(found)
        : site === "whatsapp" && kind === "chat"
          // A list item may wrap a row; expose one target per conversation.
          ? found.filter(node => !found.some(other => other !== node && node.contains(other)))
          : found;
      for (const node of ordered) {
        if (
          site === "wikipedia" &&
          node.closest('.navbox,.sidebar,.vertical-navbox,[role="navigation"]')
        )
          continue;
        const entity = make(node, kind as EntityKind);
        const key = entity.href || entity.id;
        if (entity.label && !seen.has(key)) {
          seen.add(key);
          entities.push(entity);
          kindCount++;
        }
        if (kindCount >= 40) break;
      }
    }
    let currentNodes = elements(adapter.current);
    if (site === "whatsapp") {
      const explicit = elements('#main header [data-testid="conversation-info-header-chat-title"]');
      currentNodes = explicit.length ? explicit : currentNodes.filter(node =>
        !node.closest('button,[role="button"],a') &&
        !currentNodes.some(other => other !== node && other.contains(node))
      );
    }
    const currentNode = site === "chatgpt"
      ? currentNodes.at(-1)
      : currentNodes.length === 1
        ? currentNodes[0]
        : undefined;
    let current =
      currentNode
        ? make(
            currentNode,
            adapter.currentKind ||
              (site === "spotify"
                ? "track"
                : site === "github"
                  ? "repository"
                  : site === "amazon"
                    ? "product"
                    : site === "wikipedia"
                      ? "article"
                      : site === "netflix"
                        ? "title"
                        : "post"),
          )
        : null;
    if (
      !current &&
      ((site === "x" && /\/status\//.test(new URL(url).pathname)) ||
        (site === "reddit" && /\/comments\//.test(new URL(url).pathname)))
    ) {
      const posts = entities.filter((e) => e.kind === "post");
      if (posts.length === 1) current = posts[0];
    }
    // Include draft values only in the local signature. They never leave this document.
    const drafts = elements(
      'input:not([type="password"]),textarea,[contenteditable="true"]',
    ).map((e) =>
      e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement
        ? e.value
        : e.textContent,
    );
    const controlSignature = elements(
      "button,[aria-pressed],[aria-selected],select",
    ).map((e) => [
      label(e),
      e.getAttribute("aria-pressed"),
      e.getAttribute("aria-selected"),
      e instanceof HTMLSelectElement ? e.value : "",
    ]);
    const signature = JSON.stringify([
      url,
      entities,
      current,
      controlSignature,
      drafts,
      elements("[email],[data-email]").map((e) => [
        e.getAttribute("email"),
        e.getAttribute("data-email"),
      ]),
    ]);
    if (this.signature && signature !== this.signature) this.revision++;
    this.signature = signature;
    const snapshot: SiteSnapshot = {
      site,
      url,
      documentId: this.documentId,
      revision: this.revision,
      pageType: new URL(url).pathname,
      ...(site === "meet"
        ? { meetingActive: controls(["Leave call"]).length === 1 }
        : {}),
      entities,
      current,
      capabilities: catalogue
        .filter((a) => a.site === site)
        .map((a) => {
          const spec = adapter.actions.find((s) => s.id === a.id);
          let state: SiteSnapshot["capabilities"][number]["state"] =
            !spec || spec.operation.kind === "unsupported"
              ? "not-implemented"
              : spec.write && spec.operation.kind !== "prompt"
                ? "needs-confirmation"
                : "available";
          if (spec && spec.operation.kind !== "unsupported") {
            const op = spec.operation;
            if (op.kind === "group-b") {
              const roots = elements(op.scope || adapter.scope);
              if (!roots.length) state = "unavailable";
              if (op.scope && roots.length > 1) state = "needs-choice";
              const names: Record<string, string[]> = {
                ME01: ["Join now", "Ask to join"],
                ME02: [
                  "Turn off microphone",
                  "Turn on microphone",
                  "Turn off microphone (ctrl + d)",
                  "Turn on microphone (ctrl + d)",
                ],
                ME03: [
                  "Turn off camera",
                  "Turn on camera",
                  "Turn off camera (ctrl + e)",
                  "Turn on camera (ctrl + e)",
                ],
                ME04: ["Turn off captions", "Turn on captions"],
                ME05: ["Raise hand", "Lower hand"],
                ME06: ["Show everyone", "People", "Chat with everyone", "Chat"],
                ME10: ["Leave call"],
                IR05: ["Search", "Search trains"],
                IR08: ["Swap", "Swap stations"],
                MAP07: ["Zoom in", "Zoom out"],
              };
              if (names[spec.id] && !controls(names[spec.id]).length)
                state = "unavailable";
              if (
                ["WA03", "WA04", "WA05", "WA07", "MAP03", "LI05"].includes(
                  spec.id,
                ) &&
                !current
              )
                state = "unavailable";
            }
            if (
              op.kind === "entities" &&
              !entities.some((e) => e.kind === op.entity)
            )
              state = "unavailable";
            if (op.kind === "state") {
              const roots = op.scope ? elements(op.scope) : [document];
              const matches = roots.flatMap((root) =>
                controls([...op.names, ...op.opposite], root),
              );
              state =
                matches.length === 0
                  ? "unavailable"
                  : matches.length > 1 || !current
                    ? "needs-choice"
                    : "needs-confirmation";
            }
            if (
              op.kind === "media" &&
              !elements("audio,video").length &&
              !controls(["Play", "Pause", "Next", "Previous"]).length
            )
              state = "unavailable";
            if (op.kind === "select" && !elements(op.selector).length)
              state = "unavailable";
            if (op.kind === "price" && !elements(op.upper).length)
              state = "unavailable";
            if (
              op.kind === "field" &&
              !elements('input,textarea,[contenteditable="true"]').length
            )
              state = "unavailable";
            if (
              op.kind === "control" &&
              op.names.length &&
              !controls(op.names).length
            )
              state = "unavailable";
          }
          return { id: a.id, state, description: a.description };
        }),
    };
    this.lastInspectedUrl = url;
    this.cachedSnapshot = snapshot;
    this.dirty = false;
    return snapshot;
  }
  adapter(): Adapter | null {
    const site = siteForUrl(this.url());
    return site ? adapters[site] : null;
  }
}
