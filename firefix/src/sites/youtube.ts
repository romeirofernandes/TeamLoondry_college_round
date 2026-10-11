import type { Adapter } from "./types";

export const youtube: Adapter = {
  site: "youtube",
  scope: "#movie_player, main, ytd-app",
  current:
    "ytd-watch-metadata h1, h1.ytd-video-primary-info-renderer",
  currentKind: "video",
  entities: {
    video:
      "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer",
  },
  actions: [
    {
      id: "YT01",
      pattern: /^search(?: youtube)?(?: for)? (.+)$/,
      extract: "query",
      operation: {
        kind: "search",
        url: "https://www.youtube.com/results?search_query={query}",
      },
    },
    {
      id: "YT02",
      pattern: /^(?:list|show)(?: the)? videos? on screen$/,
      operation: { kind: "entities", entity: "video" },
    },
    {
      id: "YT03",
      pattern: /^(?:open|play) (?:the )?(?:(\w+) video|video (?:number )?(\w+))(?:(?: in)? (?:a )?new tab)?$/,
      extract: "ordinal",
      operation: { kind: "entities", entity: "video" },
    },
    {
      id: "YT04",
      pattern: /^(?:open|play)(?: the)? video (?:titled|called) (.+)$/,
      extract: "query",
      operation: { kind: "entities", entity: "video" },
    },
    {
      id: "YT05",
      pattern: /^(?:pause(?: the video| youtube)?|hold the video)$/,
      operation: { kind: "media", command: "pause" },
    },
    {
      id: "YT11",
      pattern: /^(?:resume(?: the video)?|play(?: the video| youtube)?)$/,
      operation: { kind: "media", command: "play" },
    },
    {
      id: "YT06",
      pattern: /^(?:(?:skip|seek|go)(?: the)? )?(?:forward|back|rewind)(?: by)? (.+?)(?: seconds?)?$/,
      extract: "number",
      operation: { kind: "media", command: "seek" },
    },
    {
      id: "YT07",
      pattern: /^set(?: player)? volume to (.+?)(?: percent|%)$/,
      extract: "number",
      operation: { kind: "media", command: "volume" },
    },
    {
      id: "YT12",
      pattern: /^(mute(?: the)? video|unmute(?: the)? video|mute youtube|unmute youtube)$/,
      extract: "mode",
      operation: { kind: "media", command: "mute" },
    },
    {
      id: "YT08",
      pattern: /^(?:turn|switch) captions? (on|off)$/,
      extract: "mode",
      operation: {
        kind: "state",
        names: ["Turn on captions", "Subtitles/closed captions"],
        opposite: ["Turn off captions", "Subtitles are on"],
        desired: true,
      },
    },
    {
      id: "YT09",
      pattern: /^(?:set playback speed to|play at) (.+)$/,
      extract: "number",
      operation: { kind: "media", command: "speed" },
    },
    {
      id: "YT10",
      pattern: /^(?:what video is playing|what am i watching)\??$/,
      operation: { kind: "info" },
    },
  ],
};
