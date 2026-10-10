import type { Adapter } from "./types";
export const irctc: Adapter = {
  site: "irctc",
  scope: "app-train-search,app-train-list",
  current: '[data-train-number][aria-selected="true"],.train-heading',
  currentKind: "train",
  entities: {
    station:
      'p-autocomplete [role="option"],p-autocomplete .ui-autocomplete-list-item',
    train: "[data-train-number],.train-heading",
  },
  actions: [
    {
      id: "IR01",
      pattern: /^set (?:origin|from) to (.+)$/,
      extract: "query",
      operation: { kind: "group-b" },
    },
    {
      id: "IR02",
      pattern: /^set (?:destination|to) to (.+)$/,
      extract: "query",
      operation: { kind: "group-b" },
    },
    {
      id: "IR03",
      pattern: /^(?:travel on|set (?:the )?date to) (.+)$/,
      extract: "query",
      operation: { kind: "group-b" },
    },
    {
      id: "IR04",
      pattern: /^(?:choose|select) (.+)$/,
      extract: "query",
      operation: { kind: "group-b" },
    },
    {
      id: "IR05",
      pattern: /^(?:search|find) trains$/,
      write: true,
      operation: { kind: "group-b" },
    },
    {
      id: "IR06",
      pattern: /^open train (.+)$/,
      extract: "query",
      operation: { kind: "entities", entity: "train" },
    },
    {
      id: "IR07",
      pattern: /^(?:show availability|read (?:the )?fare)$/,
      extract: "mode",
      operation: { kind: "group-b" },
    },
    {
      id: "IR08",
      pattern: /^swap origin and destination$/,
      operation: { kind: "group-b" },
    },
    {
      id: "IR09",
      pattern: /^sort by departure time$/,
      operation: { kind: "group-b" },
    },
    {
      id: "IR10",
      pattern: /^add passenger$/,
      operation: {
        kind: "unsupported",
        reason:
          "Passenger details and booking are excluded. Authentication, CAPTCHA and OTP need user assistance.",
      },
    },
    {
      id: "IR11",
      pattern: /^book (?:this|the) ticket$/,
      operation: {
        kind: "unsupported",
        reason:
          "Ticket booking, payment and cancellation are excluded. No transaction control was activated.",
      },
    },
  ],
};
