import type { Adapter } from "./types";
export const netflix: Adapter = {
  site: "netflix",
  scope: "main,.mainView,.watch-video",
  current:
    ".video-title h4,.previewModal--player-titleTreatmentWrapper img[alt],.title-title",
  entities: {
    profile: ".profile-link",
    title:
      '.title-card a[href*="/watch/"],.title-card a[href*="jbv="],.previewModal--player-titleTreatmentWrapper',
    episode: ".episodeSelector .episode-item",
  },
  actions: [
    {
      id: "N01",
      pattern: /^open the profile named (.+)$/,
      extract: "query",
      operation: { kind: "entities", entity: "profile" },
    },
    {
      id: "N02",
      pattern: /^search(?: netflix)?(?: for)? (.+)$/,
      extract: "query",
      operation: {
        kind: "search",
        url: "https://www.netflix.com/search?q={query}",
      },
    },
    {
      id: "N03",
      pattern: /^(?:open(?: the)? (.+) title|show this film.s details)$/,
      extract: "query",
      operation: { kind: "entities", entity: "title" },
    },
    {
      id: "N04",
      pattern: /^(?:play this title|start(?: the)? episode)$/,
      operation: { kind: "media", command: "play" },
    },
    {
      id: "N05",
      pattern: /^continue watching (.+)$/,
      extract: "query",
      operation: { kind: "entities", entity: "title" },
    },
    {
      id: "N06",
      pattern:
        /^(?:pause(?: the| this)?(?: video| episode)?|stop playing for a moment)$/,
      operation: { kind: "media", command: "pause" },
    },
    {
      id: "N07",
      pattern:
        /^(?:resume(?: the| this)?(?: episode| video)?|continue playing)$/,
      operation: { kind: "media", command: "play" },
    },
    {
      id: "N08",
      pattern:
        /^(?:go |skip |seek )?(forward|back|rewind)(?: by)? (.+?)(?: seconds?)$/,
      extract: "number",
      operation: { kind: "media", command: "seek" },
    },
    {
      id: "N09",
      pattern: /^go to (.+)$/,
      extract: "number",
      operation: { kind: "media", command: "seek-absolute" },
    },
    {
      id: "N10",
      pattern:
        /^(mute netflix|mute this video|unmute this video|unmute netflix)$/,
      extract: "mode",
      operation: { kind: "media", command: "mute" },
    },
    {
      id: "N11",
      pattern: /^set(?: player)? volume to (.+?)(?: percent|%)$/,
      extract: "number",
      operation: { kind: "media", command: "volume" },
    },
    { id: "N12", pattern: /^what am i watching$/, operation: { kind: "info" } },
    {
      id: "N13",
      pattern:
        /^(?:like(?: this| the)?(?: video| title)?|give this(?: title)? a thumbs up|mark this as liked)$/,
      write: true,
      operation: {
        kind: "state",
        names: ["I like this", "Thumbs up"],
        opposite: ["Rated: I like this", "Remove thumbs up rating"],
        desired: true,
        scope: '.previewModal,[data-uia="player"]',
      },
    },
    {
      id: "N14",
      pattern: /^remove my rating$/,
      write: true,
      operation: {
        kind: "state",
        names: ["I like this", "Thumbs up"],
        opposite: ["Rated: I like this", "Remove thumbs up rating"],
        desired: false,
        scope: '.previewModal,[data-uia="player"]',
      },
    },
    {
      id: "N15",
      pattern: /^(close the details|back to browsing)$/,
      operation: {
        kind: "control",
        names: ["Close", "Back to Browse"],
        scope: ".previewModal,.watch-video",
        verify: "closed",
      },
    },
    {
      id: "N16",
      pattern: /^(show episodes|open the episode list)$/,
      operation: { kind: "control", names: ["Episodes"], verify: "expanded" },
    },
    {
      id: "N17",
      pattern: /^choose season (.+)$/,
      extract: "number",
      operation: { kind: "select", selector: 'select[aria-label="Season"]' },
    },
    {
      id: "N18",
      pattern: /^play episode (.+)$/,
      extract: "ordinal",
      operation: { kind: "entities", entity: "episode" },
    },
    {
      id: "N19",
      pattern: /^next episode$/,
      operation: { kind: "media", command: "next" },
    },
    {
      id: "N20",
      pattern: /^skip intro$/,
      operation: { kind: "control", names: ["Skip Intro"], verify: "closed" },
    },
    {
      id: "N21",
      pattern: /^skip recap$/,
      operation: { kind: "control", names: ["Skip Recap"], verify: "closed" },
    },
    {
      id: "N22",
      pattern: /^turn on (.+) subtitles$/,
      extract: "query",
      operation: {
        kind: "control",
        names: [],
        scope: '[data-uia="subtitle-menu"]',
        verify: "selected",
      },
    },
    {
      id: "N23",
      pattern: /^turn subtitles off$/,
      operation: {
        kind: "control",
        names: ["Off"],
        scope: '[data-uia="subtitle-menu"]',
        verify: "selected",
      },
    },
    {
      id: "N24",
      pattern: /^switch audio to (.+)$/,
      extract: "query",
      operation: {
        kind: "control",
        names: [],
        scope: '[data-uia="audio-menu"]',
        verify: "selected",
      },
    },
    {
      id: "N25",
      pattern: /^show audio and subtitles$/,
      operation: {
        kind: "control",
        names: ["Audio & Subtitles", "Audio and subtitles"],
        verify: "expanded",
      },
    },
    {
      id: "N26",
      pattern: /^(go fullscreen|leave fullscreen)$/,
      operation: {
        kind: "unsupported",
        reason:
          "Chrome requires user activation for fullscreen. Voice-only fullscreen has not been qualified.",
      },
    },
  ],
};
