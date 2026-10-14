import type { Adapter } from "./types";
export const meet: Adapter = {
  site: "meet",
  scope: "body",
  current: '[data-meeting-title],[aria-label="Meeting details"]',
  currentKind: "meeting",
  entities: { meeting: 'a[href^="https://meet.google.com/"]' },
  actions: [
    {id:"ME11",pattern:/^close (?:the )?participants$/,operation:{kind:"group-b"}},
    {id:"ME12",pattern:/^close (?:the |meeting )?chat$/,operation:{kind:"group-b"}},
    {id:"ME13",pattern:/^read (?:the )?(?:last|latest) chat message$/,operation:{kind:"group-b"}},
    {id:"ME14",pattern:/^clear my chat draft$/,operation:{kind:"group-b"}},
    {id:"ME15",pattern:/^(?:am i muted|is my (?:microphone|mic|camera) on|are captions on)$/,extract:"mode",operation:{kind:"group-b"}},
    {id:"ME16",pattern:/^who is in (?:the |this )?meeting$/,operation:{kind:"group-b"}},
    {
      id: "ME01",
      guardNames: ["Join now", "Ask to join"],
      pattern: /^(?:join this meeting|open my test meeting)$/,
      write: true,
      operation: { kind: "group-b" },
    },
    {
      id: "ME02",
      pattern:
        /^(?:mute (?:my )?(?:(?:meeting|meet) )?(?:microphone|mic)|unmute(?: my)?(?: meeting)?(?: microphone| mic| meet)?)$/,
      extract: "mode",
      operation: { kind: "group-b" },
    },
    {
      id: "ME03",
      pattern: /^turn (?:my )?(?:(?:meet|meeting) )?camera (off|on)$/,
      extract: "mode",
      operation: { kind: "group-b" },
    },
    {
      id: "ME04",
      pattern: /^turn captions (on|off)$/,
      extract: "mode",
      operation: { kind: "group-b" },
    },
    {
      id: "ME05",
      pattern: /^(raise|lower) my hand$/,
      extract: "mode",
      operation: { kind: "group-b" },
    },
    {
      id: "ME06",
      pattern: /^open (participants|meeting chat)$/,
      extract: "mode",
      operation: { kind: "group-b" },
    },
    {
      id: "ME07",
      pattern: /^write a chat message$/,
      operation: {
        kind: "group-b",
        scope: '[aria-label="In-call messages"],[data-panel-id="chat"]',
      },
    },
    {
      id: "ME08",
      guardNames: ["Send a message", "Send"],
      pattern: /^send (?:this|the)(?: message)? to the meeting$/,
      write: true,
      operation: {
        kind: "group-b",
        scope: '[aria-label="In-call messages"],[data-panel-id="chat"]',
      },
    },
    {
      id: "ME09",
      pattern: /^present this tab$/,
      operation: {
        kind: "unsupported",
        reason:
          "Screen presentation requires an assisted browser-owned picker and is not automated.",
      },
    },
    {
      id: "ME10",
      guardNames: ["Leave call"],
      pattern: /^leave (?:the|this) meeting$/,
      write: true,
      operation: { kind: "group-b" },
    },
  ],
};
