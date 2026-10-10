import type { Adapter } from "./types";
export const wikipedia: Adapter = {
  site: "wikipedia",
  scope: "#mw-content-text",
  current: "#firstHeading",
  entities: {
    article:
      ".mw-search-result-heading a, .mw-parser-output .hatnote a, .mw-parser-output ul > li > a",
    section:
      ".mw-parser-output h2[id],.mw-parser-output h3[id],.mw-heading h2[id],.mw-heading h3[id]",
    link: ".mw-parser-output p a[href]",
    reference: ".references li[id]",
  },
  actions: [
    {
      id: "W01",
      pattern:
        /^(?:search(?: wikipedia)?(?: for)?|look up|find an article about) (.+)$/,
      extract: "query",
      operation: {
        kind: "search",
        url: "https://en.wikipedia.org/w/index.php?search={query}",
      },
    },
    {
      id: "W02",
      pattern: /^(?:open|choose)(?: the)? (.+?)(?: search)? result$/,
      extract: "ordinal",
      operation: { kind: "entities", entity: "article" },
    },
    {
      id: "W03",
      pattern: /^(?:choose|i mean) (.+)$/,
      extract: "query",
      operation: { kind: "entities", entity: "article" },
    },
    {
      id: "W04",
      pattern: /^(?:open|go to|take me to)(?: the)? (.+?)(?: section)?$/,
      extract: "query",
      operation: { kind: "section" },
    },
    {
      id: "W05",
      pattern:
        /^(?:list(?: the)? sections|what headings are here)$/,
      operation: { kind: "sections" },
    },
    {
      id: "W06",
      pattern: /^(next section|previous heading|previous section)$/,
      extract: "mode",
      operation: { kind: "section-next" },
    },
    {
      id: "W07",
      pattern: /^(?:go to(?: the)? introduction|start of(?: the)? article)$/,
      operation: { kind: "introduction" },
    },
    {
      id: "W08",
      pattern: /^(?:open|follow|find|select)(?: the)? link(?: called)? (.+)$/,
      extract: "query",
      operation: { kind: "entities", entity: "link" },
    },
    {
      id: "W09",
      pattern: /^open (?:that|this|the selected) link in a new tab$/,
      operation: { kind: "entities", entity: "link" },
    },
    {
      id: "W10",
      pattern: /^(?:show reference|open citation(?: number)?) (.+)$/,
      extract: "number",
      operation: { kind: "reference" },
    },
    {
      id: "W11",
      pattern: /^(?:back to(?: the)? sentence|return from(?: the)? reference)$/,
      operation: { kind: "reference-return" },
    },
    {
      id: "W12",
      pattern: /^find (.+) in (?:this|the) article$/,
      extract: "query",
      operation: { kind: "find" },
    },
    {
      id: "W13",
      pattern: /^(next match|previous occurrence|previous match)$/,
      extract: "mode",
      operation: { kind: "find-next" },
    },
    {
      id: "W14",
      pattern: /^(?:show(?: the)? contents|expand(?: the)? table of contents|table of contents)$/,
      operation: { kind: "sections" },
    },
    {
      id: "W16",
      pattern: /^(?:show(?: the)? infobox|go to(?: the)? facts box)$/,
      operation: { kind: "section" },
    },
    {
      id: "W19",
      pattern: /^(?:show|go to) (references|external links)$/,
      extract: "query",
      operation: { kind: "section" },
    },
  ],
};
