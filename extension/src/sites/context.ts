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
  constructor(private url: () => string = () => location.href) {}
  node(id: string): HTMLElement | undefined {
    const e = this.nodes.get(id);
    return e?.isConnected && visible(e) ? e : undefined;
  }
  invalidate() {
    this.revision++;
    this.signature = "";
  }
  inspect(): SiteSnapshot | null {
    const url = this.url(),
      site = siteForUrl(url);
    if (!site) return null;
    const adapter = adapters[site],
      entities: Entity[] = [];
    this.nodes.clear();
    const make = (node: HTMLElement, kind: EntityKind): Entity => {
      const link =
        node instanceof HTMLAnchorElement
          ? node
          : node.querySelector<HTMLAnchorElement>(
              'a[href*="/status/"],a[href*="/comments/"],a[href*="/track/"]',
            ) || node.querySelector<HTMLAnchorElement>("a[href]");
      const href = ['section','reference'].includes(kind) && node.id ? new URL('#'+node.id,url).href : link
        ? new URL(link.getAttribute("href")!, url).href
        : undefined;
      const title =
        node.getAttribute("post-title") ||
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
        detail: (
          label(node) +
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
      for (const node of elements(selector!)) {
        if(site==='wikipedia' && node.closest('.navbox,.sidebar,.vertical-navbox,[role="navigation"]'))continue;
        const entity = make(node, kind as EntityKind);
        const key = entity.href || entity.id;
        if (entity.label && !seen.has(key)) {
          seen.add(key);
          entities.push(entity); kindCount++;
        }
        if (kindCount >= 40) break;
      }
    }
    const currentNodes = elements(adapter.current);
    let current =
      currentNodes.length === 1
        ? make(
            currentNodes[0],
            site === "spotify"
              ? "track"
              : site === "github"
                ? "repository"
                : site === "amazon"
                  ? "product"
                  : site === "wikipedia"
                    ? "article"
                    : site === "netflix"
                      ? "title"
                      : "post",
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
    ]);
    if (this.signature && signature !== this.signature) this.revision++;
    this.signature = signature;
    return {
      site,
      url,
      documentId: this.documentId,
      revision: this.revision,
      pageType: new URL(url).pathname,
      entities,
      current,
      capabilities: catalogue
        .filter((a) => a.site === site)
        .map((a) => {
          const spec = adapter.actions.find((s) => s.id === a.id);
          let state: SiteSnapshot["capabilities"][number]["state"] =
            !spec || spec.operation.kind === "unsupported"
              ? "not-implemented"
              : spec.write
                ? "needs-confirmation"
                : "available";
          if (spec && spec.operation.kind !== "unsupported") {
            const op = spec.operation;
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
  }
  adapter(): Adapter | null {
    const site = siteForUrl(this.url());
    return site ? adapters[site] : null;
  }
}
