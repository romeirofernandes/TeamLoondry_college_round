import type { SiteId } from "../../../extension/src/sites/types";

type SiteGuide = {
  name: string;
  summary: string;
  limits: string;
};

export const siteGuides = {
  wikipedia: {
    name: "Wikipedia",
    summary:
      "Search articles, choose results, move between sections, follow links and references, and find text.",
    limits:
      "Editing and account changes are outside the article-reading workflow.",
  },
  github: {
    name: "GitHub",
    summary:
      "Browse repositories, folders, files, issues and pull requests. Search within a repository and read discussions.",
    limits:
      "Account writes need a configured test target and confirmation where supported. Merging and repository administration are excluded.",
  },
  reddit: {
    name: "Reddit",
    summary:
      "Search communities and posts, choose results, read comments and move through a discussion.",
    limits:
      "Posting, voting and other account changes have separate guards. Availability depends on the visible page and configured test target.",
  },
  amazon: {
    name: "Amazon India",
    summary:
      "Search products, select results, inspect details, use available filters and open the cart.",
    limits:
      "Live cart additions, quantity changes, removal, checkout and payment are not supported.",
  },
  spotify: {
    name: "Spotify",
    summary:
      "Search music, choose tracks, albums and playlists, and control playback, seeking and volume.",
    limits:
      "The web player must expose its controls. Account and library actions depend on the current page and their individual checks.",
  },
  netflix: {
    name: "Netflix",
    summary:
      "Find titles, open details, control playback and use available episode, audio and subtitle controls.",
    limits:
      "A signed-in player is needed for playback. Voice-only fullscreen is not qualified because Chrome requires user activation.",
  },
  youtube: {
    name: "YouTube",
    summary:
      "Search and select videos, play or pause, seek, adjust volume and playback speed, and toggle captions.",
    limits:
      "Commands use visible videos and player controls. Likes, subscriptions and comments are outside this adapter.",
  },
  chatgpt: {
    name: "ChatGPT",
    summary:
      "Start and select chats, ask AI, summarize a conversation, stop generation and read the latest response.",
    limits:
      "Prompt actions use the ChatGPT webpage and its signed-in account. This is separate from Handsfree’s Groq answer route.",
  },
  x: {
    name: "X",
    summary:
      "Search posts and profiles, choose results, read a thread and move through the visible timeline.",
    limits:
      "Account writes have test-target and confirmation guards where supported. Private messages and account administration are excluded.",
  },
  whatsapp: {
    name: "WhatsApp Web",
    summary:
      "Find and choose chats, read and search messages, scroll a conversation, draft and send with confirmation.",
    limits:
      "Sending binds to the current chat and requires confirmation. Quoted replies and calls are not implemented.",
  },
  gmail: {
    name: "Gmail",
    summary:
      "Search and open mail, compose a draft, set its fields, reply, choose drafts, archive and change read state.",
    limits:
      "Sending requires allowed Gmail recipients under Profile → Advanced and a separate confirmation. The site adapter does not automate Gmail’s attachment picker.",
  },
  meet: {
    name: "Google Meet",
    summary:
      "Join or leave with confirmation, set microphone, camera, captions and hand state, and open participants or chat.",
    limits:
      "During a call, address commands with Handsfree. Chat sends require an allowed private meeting and confirmation. Presenting a screen is not implemented.",
  },
  linkedin: {
    name: "LinkedIn",
    summary:
      "Search jobs, set location and available filters, choose a job, read details and save or unsave with confirmation.",
    limits:
      "Messaging, applications and connection requests are not implemented.",
  },
  irctc: {
    name: "IRCTC",
    summary:
      "Choose exact stations and a full travel date, set class and quota, search trains with confirmation, and read availability or fares.",
    limits:
      "CAPTCHA, OTP and sign-in need your attention. Passenger details, booking, payments and cancellation are excluded.",
  },
  maps: {
    name: "Google Maps",
    summary:
      "Find places, read address and hours, look up directions, review a resolved route, and choose transport or route options.",
    limits:
      "Directions are reviewed after Maps resolves the places. Canvas panning, live navigation and Street View are not qualified.",
  },
} satisfies Record<SiteId, SiteGuide>;
