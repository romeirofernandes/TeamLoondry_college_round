import type { Adapter } from "./types";
export const github: Adapter = {
  site: "github",
  scope: "main",
  current:
    '[itemprop="name"] a, strong[itemprop="name"], [data-testid="issue-title"], .markdown-title',
  entities: {
    repository:
      'a[data-testid="result-repository"], .search-title a, h3 a[href]',
    folder:
      '[role="row"] a[href*="/tree/"], .react-directory-filename-cell a[href*="/tree/"]',
    file: '[role="row"] a[href*="/blob/"], .react-directory-filename-cell a[href*="/blob/"], [role="dialog"] a[href*="/blob/"]',
    issue:
      'a[href*="/issues/"][data-hovercard-type="issue"], .Link--primary[href*="/issues/"]',
    "pull-request": 'a[href*="/pull/"][data-hovercard-type="pull_request"]',
  },
  actions: [
    {
      id: "G01",
      pattern: /^search(?: github)?(?: for)? (.+)$/,
      extract: "query",
      operation: { kind: "search", url: "https://github.com/search?q={query}" },
    },
    {
      id: "G02",
      pattern:
        /^(?:show|search only)(?: the)? (repository results|repositories|issues|code|users)$/,
      extract: "query",
      operation: {
        kind: "control",
        names: ["Repositories", "Issues", "Code", "Users"],
        scope: '[aria-label="Search filters"],nav',
        verify: "selected",
      },
    },
    {
      id: "G03",
      pattern: /^open (.+?)(?: repository)?$/,
      extract: "query",
      operation: { kind: "entities", entity: "repository" },
    },
    {
      id: "G04",
      pattern: /^(?:show(?: the)? readme|go to repository overview)$/,
      operation: { kind: "route", path: "/{repo}" },
    },
    {
      id: "G05",
      pattern: /^open (?:the )?(.+) folder$/,
      extract: "query",
      operation: { kind: "entities", entity: "folder" },
    },
    {
      id: "G06",
      pattern: /^open (.+(?: dot |\.).+)$/,
      extract: "query",
      operation: { kind: "entities", entity: "file" },
    },
    {
      id: "G07",
      pattern: /^go up one folder$/,
      operation: { kind: "route", path: "{parent}" },
    },
    {
      id: "G08",
      pattern: /^find a file named (.+)$/,
      extract: "query",
      operation: { kind: "entities", entity: "file", selectOnly: true },
    },
    {
      id: "G09",
      pattern: /^switch to(?: the)? (.+) branch$/,
      extract: "query",
      operation: {
        kind: "control",
        names: [],
        verify: "entity-change",
      },
    },
    {
      id: "G10",
      pattern: /^(?:open|show) (issues|pull requests)$/,
      extract: "mode",
      operation: { kind: "route", path: "/{repo}/{mode}" },
    },
    {
      id: "G11",
      pattern: /^(?:search issues(?: for)? (.+)|show (open|closed) issues)$/,
      extract: "query",
      operation: {
        kind: "search",
        url: "https://github.com/{repo}/issues?q={query}",
      },
    },
    {
      id: "G12",
      pattern: /^open issue (.+)$/,
      extract: "number",
      operation: { kind: "route", path: "/{repo}/issues/{value}" },
    },
    {
      id: "G13",
      pattern: /^open pull request (.+)$/,
      extract: "number",
      operation: { kind: "route", path: "/{repo}/pull/{value}" },
    },
    {
      id: "G14",
      pattern:
        /^(?:show(?: the)? (changed files)|open(?: the)? (conversation))$/,
      extract: "mode",
      operation: {
        kind: "control",
        names: ["Files changed", "Conversation"],
        scope: '[aria-label="Pull request tabs"],nav',
        verify: "selected",
      },
    },
    {
      id: "G15",
      pattern: /^(?:star(?: this)?(?: repository)?|like this repo|like this)$/,
      write: true,
      operation: {
        kind: "state",
        names: ["Star", "Star this repository"],
        opposite: ["Unstar", "Unstar this repository"],
        desired: true,
        scope: "main",
      },
    },
    {
      id: "G16",
      pattern: /^(?:remove my star|unstar(?: this)?(?: repository)?)$/,
      write: true,
      operation: {
        kind: "state",
        names: ["Star", "Star this repository"],
        opposite: ["Unstar", "Unstar this repository"],
        desired: false,
        scope: "main",
      },
    },
    {
      id: "G17",
      pattern: /^show commits$/,
      operation: { kind: "route", path: "/{repo}/commits" },
    },
    {
      id: "G18",
      pattern: /^show releases$/,
      operation: { kind: "route", path: "/{repo}/releases" },
    },
    {
      id: "G19",
      pattern: /^(?:go to|show) line (.+)$/,
      extract: "number",
      operation: { kind: "section" },
    },
    {
      id: "G21",
      pattern: /^create a new issue draft$/,
      operation: { kind: "route", path: "/{repo}/issues/new" },
    },
    {
      id: "G22",
      pattern:
        /^(?:write|select)(?: the)?(?: issue)? (title|body|description)(?: field)?$/,
      extract: "mode",
      operation: {
        kind: "field",
        names: [
          "Title",
          "Add a title",
          "Add a description",
          "Description",
          "Body",
        ],
        scope: "main form",
      },
    },
    {
      id: "G23",
      pattern: /^(?:preview(?: the)? issue|show edit mode)$/,
      operation: {
        kind: "control",
        names: ["Preview", "Write"],
        scope: "main form",
        verify: "selected",
      },
    },
    {
      id: "G24",
      pattern: /^submit (?:this|the) issue$/,
      write: true,
      operation: {
        kind: "submit",
        names: ["Submit new issue", "Create issue"],
        scope: "main form",
        created: '[data-testid="issue-title"],.markdown-title',
      },
    },
    {
      id: "G25",
      pattern: /^(?:reply to this issue|write a comment)$/,
      operation: {
        kind: "field",
        names: ["Leave a comment", "Add a comment", "Comment"],
        scope: "main form",
      },
    },
    {
      id: "G26",
      pattern: /^post (?:the|this) comment$/,
      write: true,
      operation: {
        kind: "submit",
        names: ["Comment"],
        scope: "main form",
        created: ".timeline-comment",
      },
    },
  ],
};
