import type { Adapter } from "./types";
export const whatsapp: Adapter = {
  site: "whatsapp",
  scope: "#main",
  current:
    '#main header [title],#main header [data-testid="conversation-info-header-chat-title"]',
  currentKind: "chat",
  entities: {
    chat: '#pane-side [role="row"]',
    message: "#main .message-in,#main .message-out",
  },
  actions: [
    {
      id: "WA01",
      pattern:
        /^(?:open (?:my |the )?chat with|search(?: for)?|find (?:the )?conversation with) (.+)$/,
      extract: "query",
      operation: { kind: "entities", entity: "chat" },
    },
    {
      id: "WA02",
      pattern: /^(?:show unread chats|open the next chat|next chat)$/,
      extract: "mode",
      operation: { kind: "group-b" },
    },
    {
      id: "WA03",
      pattern: /^read (?:the )?(latest|previous) message$/,
      extract: "mode",
      operation: { kind: "group-b", scope: "#main" },
    },
    {
      id: "WA04",
      pattern: /^(?:go to the newest message|scroll (older|newer) messages)$/,
      extract: "mode",
      operation: { kind: "group-b", scope: "#main" },
    },
    {
      id: "WA05",
      pattern: /^(?:write|dictate|draft) (?:a |the )?message$/,
      operation: { kind: "group-b", scope: "#main" },
    },
    {
      id: "WA06",
      guardNames: ["Send"],
      pattern:
        /^(?:send (?:this|the)(?: message| draft| to my test chat)?|please send my draft)$/,
      write: true,
      operation: { kind: "group-b", scope: "#main" },
    },
    {
      id: "WA07",
      guardNames: ["Clear draft"],
      pattern: /^(?:clear (?:this|the) draft|cancel sending)$/,
      write: true,
      extract: "mode",
      operation: { kind: "group-b", scope: "#main" },
    },
    {
      id: "WA08",
      pattern: /^search this chat for (.+)$/,
      extract: "query",
      operation: { kind: "group-b", scope: "#main" },
    },
    {
      id: "WA09",
      pattern: /^(open|close) chat info$/,
      extract: "mode",
      operation: { kind: "group-b", scope: "#main" },
    },
    {
      id: "WA10",
      pattern: /^reply to that message$/,
      operation: {
        kind: "unsupported",
        reason:
          "Quoted message replies need a selected message and are not supported yet. The chat draft remains available.",
      },
    },
    {
      id: "WA11",
      pattern: /^call this contact$/,
      operation: {
        kind: "unsupported",
        reason: "WhatsApp calls are outside the supported desktop workflows.",
      },
    },
  ],
};
