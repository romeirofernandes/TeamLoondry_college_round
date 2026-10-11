import type { Adapter } from "./types";
export const spotify: Adapter = {
  site: "spotify",
  scope: "main",
  current:
    '[data-testid="now-playing-widget"] [data-testid="context-item-link"], [data-testid="nowplaying-track-link"]',
  entities: {
    track: '[data-testid="tracklist-row"]',
    album: 'a[href^="/album/"]',
    playlist: 'a[href^="/playlist/"]',
    artist: 'a[href^="/artist/"]',
  },
  actions: [
    {
      id: "S01",
      pattern: /^search(?: spotify)?(?: for)? (.+)$/,
      extract: "query",
      operation: {
        kind: "search",
        url: "https://open.spotify.com/search/{query}",
      },
    },
    {
      id: "S02",
      pattern: /^show (songs|albums|playlists|artists|podcasts)$/,
      extract: "query",
      operation: {
        kind: "control",
        names: [],
        scope: "main",
        verify: "selected",
      },
    },
    {
      id: "S03",
      pattern: /^play (.+?)(?: by (.+))?$/,
      extract: "query",
      operation: { kind: "entities", entity: "track" },
    },
    {
      id: "S04",
      pattern: /^open(?: the)? album (.+)$/,
      extract: "query",
      operation: { kind: "entities", entity: "album" },
    },
    {
      id: "S05",
      pattern: /^(play this playlist|start the album)$/,
      operation: { kind: "media", command: "play" },
    },
    {
      id: "S06",
      pattern:
        /^(?:pause(?: the| this)?(?: song| music)?|hold(?: the)? music|stop playing for a moment)$/,
      operation: { kind: "media", command: "pause" },
    },
    {
      id: "S07",
      pattern: /^(?:resume(?: the| this)?(?: music| song)?|continue playing)$/,
      operation: { kind: "media", command: "play" },
    },
    {
      id: "S08",
      pattern:
        /^(?:next(?: track| song)?|skip this (?:song|track)|play the next one|move to the following track)$/,
      operation: { kind: "media", command: "next" },
    },
    {
      id: "S09",
      pattern: /^(previous track|previous song|restart this song)$/,
      extract: "mode",
      operation: { kind: "media", command: "previous" },
    },
    {
      id: "S10",
      pattern:
        /^(mute spotify|mute the player|unmute the player|unmute spotify)$/,
      extract: "mode",
      operation: { kind: "media", command: "mute" },
    },
    {
      id: "S11",
      pattern: /^set(?: player)? volume to (.+?)(?: percent|%)$/,
      extract: "number",
      operation: { kind: "media", command: "volume" },
    },
    {
      id: "S12",
      pattern:
        /^(?:turn it up a little|lower volume (.+?)(?: percent|%)|turn volume up (.+?)(?: percent|%))$/,
      extract: "number",
      operation: { kind: "media", command: "volume-relative" },
    },
    {
      id: "S13",
      pattern:
        /^(?:go |skip |seek )?(forward|back|rewind)(?: by)? (.+?)(?: seconds?)$/,
      extract: "number",
      operation: { kind: "media", command: "seek" },
    },
    {
      id: "S14",
      pattern: /^(?:jump|go) to (.+)$/,
      extract: "number",
      operation: { kind: "media", command: "seek-absolute" },
    },
    {
      id: "S15",
      pattern: /^what song is playing$/,
      operation: { kind: "info" },
    },
    {
      id: "S16",
      pattern:
        /^(?:like(?: this)?(?: song)?|save(?: the)? current track|give this a thumbs up|mark this as liked)$/,
      write: true,
      operation: {
        kind: "state",
        names: ["Add to Liked Songs", "Save to Your Library", "Save"],
        opposite: [
          "Remove from Liked Songs",
          "Remove from Your Library",
          "Saved",
        ],
        desired: true,
        scope: '[data-testid="now-playing-widget"]',
      },
    },
    {
      id: "S17",
      pattern: /^remove this from liked songs$/,
      write: true,
      operation: {
        kind: "state",
        names: ["Add to Liked Songs", "Save to Your Library", "Save"],
        opposite: [
          "Remove from Liked Songs",
          "Remove from Your Library",
          "Saved",
        ],
        desired: false,
        scope: '[data-testid="now-playing-widget"]',
      },
    },
    {
      id: "S18",
      pattern: /^(show my library|open liked songs)$/,
      extract: "mode",
      operation: { kind: "route", path: "/collection/tracks" },
    },
    {
      id: "S19",
      pattern: /^show the queue$/,
      operation: { kind: "control", names: ["Queue"], verify: "expanded" },
    },
    {
      id: "S27",
      pattern: /^(show lyrics|close lyrics)$/,
      extract: "mode",
      operation: { kind: "control", names: ["Lyrics"], verify: "expanded" },
    },
  ],
};
