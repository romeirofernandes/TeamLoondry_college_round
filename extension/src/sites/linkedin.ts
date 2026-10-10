import type { Adapter } from "./types";
export const linkedin: Adapter = {
  site: "linkedin",
  scope: "main",
  current:
    ".job-details-jobs-unified-top-card__job-title,.jobs-unified-top-card__job-title",
  currentKind: "job",
  entities: {
    job: 'a.job-card-list__title--link,a.job-card-container__link,[data-job-id] a[href*="/jobs/view/"]',
  },
  actions: [
    {
      id: "LI01",
      pattern:
        /^(?:search linkedin jobs for|look for|find) (.+?)(?: jobs| roles)?$/,
      extract: "query",
      operation: {
        kind: "search",
        url: "https://www.linkedin.com/jobs/search/?keywords={query}",
      },
    },
    {
      id: "LI02",
      pattern: /^set location to (.+)$/,
      extract: "query",
      operation: { kind: "group-b" },
    },
    {
      id: "LI03",
      pattern:
        /^(?:filter for|choose) (remote jobs|full time|part time|hybrid jobs|on site jobs)$/,
      extract: "query",
      operation: { kind: "group-b" },
    },
    {
      id: "LI04",
      pattern: /^open (?:the )?(.+) job$/,
      extract: "query",
      operation: { kind: "entities", entity: "job" },
    },
    {
      id: "LI05",
      pattern: /^(?:read job details|return to results)$/,
      extract: "mode",
      operation: { kind: "group-b" },
    },
    {
      id: "LI06",
      guardNames: ["Save", "Saved", "Unsave"],
      pattern: /^(save|unsave) (?:this|the) job$/,
      extract: "mode",
      write: true,
      operation: {
        kind: "group-b",
        scope:
          ".jobs-search__job-details--container,.jobs-details,.job-view-layout",
      },
    },
    {
      id: "LI07",
      pattern: /^show the company profile$/,
      operation: { kind: "group-b" },
    },
    {
      id: "LI08",
      pattern: /^draft a message to my test contact$/,
      operation: {
        kind: "unsupported",
        reason:
          "Contact-specific LinkedIn messaging is outside the qualified job-search adapter.",
      },
    },
    {
      id: "LI09",
      pattern: /^apply for this role$/,
      operation: {
        kind: "unsupported",
        reason:
          "Applications and employer redirects require assisted review. No application was submitted.",
      },
    },
    {
      id: "LI10",
      pattern: /^send this connection request$/,
      operation: {
        kind: "unsupported",
        reason:
          "Connection requests and bulk outreach are outside the supported workflows.",
      },
    },
  ],
};
