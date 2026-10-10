import type { Adapter } from "./types";
export const maps: Adapter = {
  site: "maps",
  scope: '[role="main"]',
  current: '[role="main"] h1',
  currentKind: "place",
  entities: {
    place: 'a.hfpxzc,a[href*="/maps/place/"][aria-label]',
    route: '[data-trip-index],[role="listitem"][data-route-index]',
  },
  actions: [
    {
      id: "MAP01",
      pattern: /^(?:find|look up|search maps for) (.+)$/,
      extract: "query",
      operation: {
        kind: "search",
        url: "https://www.google.com/maps/search/?api=1&query={query}",
      },
    },
    {
      id: "MAP02",
      pattern: /^open (?:the )?(.+) result$/,
      extract: "query",
      operation: { kind: "entities", entity: "place" },
    },
    {
      id: "MAP03",
      pattern: /^(?:read (?:the )?address|show opening hours)$/,
      extract: "mode",
      operation: { kind: "group-b" },
    },
    {
      id: "MAP04",
      pattern:
        /^(?:(?:get|show) directions from (.+) to (.+)|review directions)$/,
      extract: "query",
      write: true,
      operation: { kind: "group-b" },
    },
    {
      id: "MAP05",
      pattern:
        /^(?:use|switch to|show) (walking|driving|public transit|public transport|transit|cycling|bicycling)(?: directions)?$/,
      extract: "mode",
      operation: { kind: "group-b" },
    },
    {
      id: "MAP06",
      pattern: /^choose (?:the )?(.+) route$/,
      extract: "query",
      operation: { kind: "entities", entity: "route" },
    },
    {
      id: "MAP07",
      pattern: /^zoom (?:the map )?(in|out)(?: one level)?$/,
      extract: "mode",
      operation: { kind: "group-b" },
    },
    {
      id: "MAP08",
      pattern: /^pan the map (north|south|east|west)$/,
      extract: "mode",
      operation: {
        kind: "unsupported",
        reason:
          "This canvas has no qualified semantic pan control. Dragging and synthetic keyboard panning are not claimed.",
      },
    },
    {
      id: "MAP09",
      pattern: /^search near this place for (.+)$/,
      extract: "query",
      operation: { kind: "group-b" },
    },
    {
      id: "MAP10",
      pattern: /^avoid (tolls|highways)$/,
      extract: "mode",
      operation: { kind: "group-b" },
    },
    {
      id: "MAP11",
      pattern: /^start navigation$/,
      operation: {
        kind: "unsupported",
        reason:
          "Desktop route planning is supported. Live turn-by-turn navigation and Street View are outside this adapter.",
      },
    },
  ],
};
