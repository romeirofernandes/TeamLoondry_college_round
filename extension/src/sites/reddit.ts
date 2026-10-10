import type { Adapter } from "./types";
export const reddit: Adapter = {
  site: "reddit",
  scope: "main,shreddit-post",
  current: "shreddit-post[post-title], main h1",
  entities: {
    post: 'shreddit-post,article[data-testid="post-container"],.Post',
    comment: 'shreddit-comment,[data-testid="comment"],.Comment',
    community: 'a[href^="/r/"]',
  },
  actions: [
    {
      id: "R01",
      pattern: /^search(?: reddit)?(?: for)? (.+)$/,
      extract: "query",
      operation: {
        kind: "search",
        url: "https://www.reddit.com/search/?q={query}",
      },
    },
    {
      id: "R02",
      pattern: /^search within this community(?: for)? (.+)$/,
      extract: "query",
      operation: {
        kind: "search",
        url: "https://www.reddit.com/r/{community}/search/?q={query}&restrict_sr=on",
      },
    },
    {
      id: "R03",
      pattern: /^open r(?: slash |\/)([\w]+)$/,
      extract: "query",
      operation: { kind: "route", path: "/r/{query}/" },
    },
    {
      id: "R04",
      pattern: /^open (?:the )?(.+) post$/,
      extract: "query",
      operation: { kind: "entities", entity: "post" },
    },
    {
      id: "R05",
      pattern: /^(next post|previous post)$/,
      extract: "mode",
      operation: { kind: "entities", entity: "post", selectOnly: true },
    },
    {
      id: "R06",
      pattern: /^(?:show comments|open(?: the)? discussion)$/,
      operation: { kind: "entities", entity: "post" },
    },
    {
      id: "R07",
      pattern:
        /^(?:sort posts by|show) (new|hot|top|best)(?: posts)?(?: (today|this week|this month|all time))?$/,
      extract: "query",
      operation: {
        kind: "control",
        names: [],
        scope: 'main, [role="menu"]',
        verify: "selected",
      },
    },
    {
      id: "R08",
      pattern:
        /^(?:sort comments by|show) (best|new|top|old|controversial)(?: comments)?$/,
      extract: "query",
      operation: {
        kind: "control",
        names: [],
        scope: '[aria-label="Comment sort"],[role="menu"]',
        verify: "selected",
      },
    },
    {
      id: "R09",
      pattern: /^(?:expand this thread|show(?: the)? replies to comment (.+))$/,
      extract: "number",
      operation: {
        kind: "control",
        names: ["Expand", "Expand thread", "Show replies"],
        verify: "expanded",
      },
    },
    {
      id: "R10",
      pattern: /^collapse this comment thread$/,
      operation: {
        kind: "control",
        names: ["Collapse", "Collapse thread"],
        verify: "expanded",
      },
    },
    {
      id: "R11",
      pattern: /^(next comment|previous comment|go to the parent comment)$/,
      extract: "mode",
      operation: { kind: "entities", entity: "comment", selectOnly: true },
    },
    {
      id: "R12",
      pattern:
        /^(?:like(?: this| the)?(?: post| video)?|upvote(?: this| the)?(?: post| video)?)$/,
      write: true,
      operation: {
        kind: "state",
        names: ["Upvote"],
        opposite: ["Remove upvote", "Upvoted"],
        desired: true,
      },
    },
    {
      id: "R13",
      pattern: /^(?:downvote this post|give it a downvote)$/,
      write: true,
      operation: {
        kind: "state",
        names: ["Downvote"],
        opposite: ["Remove downvote", "Downvoted"],
        desired: true,
      },
    },
    {
      id: "R14",
      pattern: /^(?:remove my vote|undo that upvote)$/,
      write: true,
      operation: {
        kind: "state",
        names: ["Upvote"],
        opposite: ["Remove upvote", "Upvoted"],
        desired: false,
      },
    },
    {
      id: "R15",
      pattern: /^upvote this comment$/,
      write: true,
      operation: {
        kind: "state",
        names: ["Upvote"],
        opposite: ["Remove upvote", "Upvoted"],
        desired: true,
      },
    },
    {
      id: "R16",
      pattern: /^(?:close this post|return to(?: the)? feed)$/,
      operation: { kind: "back" },
    },
    {
      id: "R17",
      pattern: /^(save this post|unsave it)$/,
      extract: "mode",
      write: true,
      operation: {
        kind: "state",
        names: ["Save"],
        opposite: ["Unsave"],
        desired: true,
      },
    },
    {
      id: "R20",
      pattern: /^reply to (?:this post|comment (.+))$/,
      extract: "number",
      operation: {
        kind: "control",
        names: ["Reply", "Add a comment"],
        verify: "expanded",
      },
    },
    {
      id: "R21",
      pattern: /^write (?:the|this) reply$/,
      operation: {
        kind: "field",
        names: ["Reply", "Add a comment", "Comment"],
        scope: 'form,[role="dialog"]',
      },
    },
    {
      id: "R22",
      pattern: /^post (?:this|the) reply$/,
      write: true,
      operation: {
        kind: "submit",
        names: ["Reply", "Comment", "Post"],
        scope: "form",
        created: 'shreddit-comment,[data-testid="comment"]',
      },
    },
    {
      id: "R23",
      pattern: /^discard (?:this|the) reply$/,
      write: true,
      operation: { kind: "clear-draft", scope: "form" },
    },
    {
      id: "R24",
      pattern: /^(play this post.s video|pause(?: the| this)?(?: video)?)$/,
      extract: "mode",
      operation: { kind: "media", command: "play" },
    },
    {
      id: "R25",
      pattern: /^(mute this video|unmute it)$/,
      extract: "mode",
      operation: { kind: "media", command: "mute" },
    },
  ],
};
