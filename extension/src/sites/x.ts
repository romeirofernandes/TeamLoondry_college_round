import type { Adapter } from "./types";
export const x: Adapter = {
  site: "x",
  scope: "main",
  current: '[data-testid="tweetDetail"]',
  entities: {
    post: 'article[data-testid="tweet"]',
    profile: 'a[data-testid="UserCell"]',
  },
  actions: [
    {
      id: "X01",
      pattern: /^search(?: x| twitter)?(?: for)? (.+)$/,
      extract: "query",
      operation: {
        kind: "search",
        url: "https://x.com/search?q={query}&src=typed_query",
      },
    },
    {
      id: "X02",
      pattern: /^open (?:the )?(.+) post$/,
      extract: "query",
      operation: { kind: "entities", entity: "post" },
    },
    {
      id: "X03",
      pattern: /^open the profile named (.+)$/,
      extract: "query",
      operation: { kind: "entities", entity: "profile" },
    },
    {
      id: "X04",
      pattern: /^show replies$/,
      operation: { kind: "entities", entity: "post" },
    },
    {
      id: "X05",
      pattern: /^next post$/,
      extract: "mode",
      operation: { kind: "entities", entity: "post", selectOnly: true },
    },
    {
      id: "X06",
      pattern: /^previous post$/,
      extract: "mode",
      operation: { kind: "entities", entity: "post", selectOnly: true },
    },
    {
      id: "X07",
      pattern:
        /^(?:like(?: this)?(?: post)?|give this a thumbs up|mark this as liked)$/,
      write: true,
      operation: {
        kind: "state",
        names: ["Like"],
        opposite: ["Unlike"],
        desired: true,
      },
    },
    {
      id: "X08",
      pattern: /^unlike (?:this|the) post$/,
      write: true,
      operation: {
        kind: "state",
        names: ["Like"],
        opposite: ["Unlike"],
        desired: false,
      },
    },
    {
      id: "X09",
      pattern: /^bookmark this post$/,
      write: true,
      operation: {
        kind: "state",
        names: ["Bookmark"],
        opposite: ["Remove Bookmark"],
        desired: true,
      },
    },
    {
      id: "X10",
      pattern: /^remove this bookmark$/,
      write: true,
      operation: {
        kind: "state",
        names: ["Bookmark"],
        opposite: ["Remove Bookmark"],
        desired: false,
      },
    },
    {
      id: "X11",
      pattern: /^show my bookmarks$/,
      operation: { kind: "route", path: "/i/bookmarks" },
    },
    {
      id: "X12",
      pattern: /^back to the feed$/,
      operation: { kind: "route", path: "/home" },
    },
    {
      id: "X13",
      pattern: /^reply to this post$/,
      operation: { kind: "control", names: ["Reply"], verify: "expanded" },
    },
    {
      id: "X14",
      pattern: /^write (?:the|this) reply$/,
      operation: {
        kind: "field",
        names: ["Post text", "Reply text"],
        scope: '[role="dialog"]',
      },
    },
    {
      id: "X15",
      pattern: /^post (?:this|the) reply$/,
      write: true,
      operation: {
        kind: "submit",
        names: ["Reply"],
        scope: '[role="dialog"]',
        created: 'article[data-testid="tweet"]',
      },
    },
    {
      id: "X16",
      pattern: /^discard (?:this|the) reply$/,
      write: true,
      operation: { kind: "clear-draft", scope: '[role="dialog"]' },
    },
  ],
};
