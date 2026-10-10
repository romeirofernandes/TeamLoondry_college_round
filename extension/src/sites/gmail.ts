import type { Adapter } from "./types";
export const gmail: Adapter = {
  site: "gmail",
  scope: '[role="main"]',
  current: '[role="main"] h2.hP',
  currentKind: "thread",
  entities: { thread: '[role="main"] tr.zA', draft: '[role="dialog"]' },
  actions: [
    {
      id: "GM01",
      pattern: /^search(?: gmail)?(?: for)? (.+)$/,
      extract: "query",
      operation: { kind: "group-b" },
    },
    {
      id: "GM02",
      pattern: /^open (?:the )?(.+?)(?: result| email| conversation)$/,
      extract: "query",
      operation: { kind: "entities", entity: "thread" },
    },
    {
      id: "GM03",
      pattern: /^(?:go back to inbox|expand the latest message)$/,
      extract: "mode",
      operation: { kind: "group-b" },
    },
    {
      id: "GM04",
      pattern:
        /^(?:compose (?:an |a )?email|write (?:the )?(recipient|subject|body)(?: field)?)$/,
      extract: "mode",
      operation: { kind: "group-b" },
    },
    {
      id: "GM05",
      pattern: /^send (?:this|the) (?:email|draft|to my test address)$/,
      write: true,
      operation: { kind: "group-b", scope: '[role="dialog"]' },
    },
    {
      id: "GM06",
      pattern: /^(?:reply to this email|answer the latest email)$/,
      operation: { kind: "group-b", scope: '[role="main"]' },
    },
    {
      id: "GM07",
      pattern: /^(?:archive this conversation|restore that email)$/,
      extract: "mode",
      write: true,
      operation: { kind: "group-b", scope: '[role="main"]' },
    },
    {
      id: "GM08",
      pattern: /^mark as (unread|read)$/,
      extract: "mode",
      write: true,
      operation: { kind: "group-b", scope: '[role="main"]' },
    },
    {
      id: "GM09",
      pattern: /^switch to the other draft$/,
      operation: { kind: "entities", entity: "draft", selectOnly: true },
    },
    {
      id: "GM10",
      pattern: /^discard (?:this|the) draft$/,
      write: true,
      operation: { kind: "group-b", scope: '[role="dialog"]' },
    },
    {
      id: "GM11",
      pattern: /^attach (?:the )?(.+)$/,
      extract: "query",
      operation: {
        kind: "unsupported",
        reason:
          "File attachments require an assisted browser file picker and are outside this release.",
      },
    },
  ],
};
