import type { Adapter } from "./types";

export const chatgpt: Adapter = {
  site: "chatgpt",
  scope: "main",
  current: 'main [data-message-author-role="assistant"]',
  currentKind: "message",
  entities: {
    chat: 'nav a[href^="/c/"], aside a[href^="/c/"]',
  },
  actions: [
    {
      id: "CH01",
      pattern: /^(?:start|create|begin)(?: a)? new chat$/,
      operation: {
        kind: "control",
        names: ["New chat", "New chat, ⌘⇧O"],
        verify: "destination",
      },
    },
    {
      id: "CH02",
      // "ChatGPT" is often split or mistranscribed by speech recognition.
      // Prefer the easy-to-say "Ask AI …" phrase, while keeping the old forms.
      pattern: /^(?:(?:word|would) )?(?:i want to )?ask (?:(?:chat ?gpt)|(?:the )?ai|this assistant) (.+)$/,
      extract: "query",
      write: true,
      operation: {
        kind: "prompt",
        editor: '#mobile-composer-prompt, #prompt-textarea, textarea[placeholder="Ask ChatGPT"], [contenteditable="true"][data-placeholder], textarea[placeholder*="Message"]',
        submitNames: ["Send prompt", "Send message", "Send"],
        responseSelector: 'main [data-message-author-role="assistant"]',
      },
    },
    {
      id: "CH03",
      pattern: /^summarize (?:this|the current) (?:conversation|chat)$/,
      write: true,
      operation: {
        kind: "prompt",
        editor: '#mobile-composer-prompt, #prompt-textarea, textarea[placeholder="Ask ChatGPT"], [contenteditable="true"][data-placeholder], textarea[placeholder*="Message"]',
        submitNames: ["Send prompt", "Send message", "Send"],
        responseSelector: 'main [data-message-author-role="assistant"]',
      },
    },
    {
      id: "CH04",
      pattern: /^(?:stop generating|stop the response|stop ChatGPT)$/, 
      operation: {
        kind: "control",
        names: ["Stop generating", "Stop streaming"],
        verify: "closed",
      },
    },
    {
      id: "CH05",
      pattern: /^(?:regenerate|regenerate the response|try again)$/, 
      operation: {
        kind: "control",
        names: ["Regenerate", "Regenerate response"],
        verify: "entity-change",
      },
    },
    {
      id: "CH06",
      pattern: /^read (?:the )?(?:last|latest) response$/, 
      operation: { kind: "info" },
    },
    {
      id: "CH07",
      pattern: /^(?:list conversations|open conversation (.+))$/,
      extract: "query",
      operation: { kind: "entities", entity: "chat" },
    },
  ],
};
