import { describe, it, expect } from "vitest";
import { parseSite, siteCandidates } from "../src/sites/language";
import { siteHomes } from "../src/sites/catalogue";
import type { SiteId, SiteSnapshot } from "../src/sites/types";
// Development corpus, not a measured speech corpus or a held-out accuracy result.
const negatives = [
  "don't like this",
  "do not like this video",
  "never like this post",
  "not now",
  "don't unlike this",
  "I like this song's lyrics",
  "I love this video",
  "I enjoy this episode",
  "how do I like a video",
  "how can I save this song",
  "write 'like the video'",
  "write 'send this reply'",
  "say 'like this'",
  "say 'next episode'",
  "write 'confirm'",
  "checkout",
  "buy now",
  "purchase this",
  "place my order",
  "pay now",
  "merge this pull request",
  "delete my repository",
  "delete my account",
  "subscribe to this",
  "place the order",
  "like this but don't do it",
  "do not remove my vote",
  "don't post the reply",
  "never submit this issue",
  "do not add it to my cart",
] as const;
const sites = Object.keys(siteHomes) as SiteId[];
function snapshot(site: SiteId): SiteSnapshot {
  return {
    site,
    url: siteHomes[site],
    documentId: "evaluation",
    revision: 0,
    pageType: "/",
    entities: [],
    current: null,
    capabilities: [],
  };
}
describe("210 shared negative site utterances", () => {
  for (const site of sites)
    it.each(negatives)(`${site}: %s`, (text) => {
      expect(parseSite(text, snapshot(site))).toBeNull();
      expect(siteCandidates(text, snapshot(site))).toEqual({});
    });
});
const positives: [SiteId, string, string][] = [
  ["wikipedia", "look up India", "W01"],
  ["wikipedia", "list the sections", "W05"],
  ["wikipedia", "open the link called Solar System", "W08"],
  ["github", "open the src folder", "G05"],
  ["github", "open issue forty-two", "G12"],
  ["github", "star this repository", "G15"],
  ["reddit", "search Reddit for keyboards", "R01"],
  ["reddit", "like the video", "R12"],
  ["reddit", "downvote this post", "R13"],
  ["amazon", "search Amazon for headphones", "A01"],
  ["amazon", "choose black", "A08"],
  ["amazon", "show customer reviews", "A12"],
  ["spotify", "pause the song", "S06"],
  ["spotify", "go forward thirty seconds", "S13"],
  ["spotify", "set volume to forty percent", "S11"],
  ["netflix", "pause this episode", "N06"],
  ["netflix", "next episode", "N19"],
  ["netflix", "like this video", "N13"],
  ["x", "search X for browser accessibility", "X01"],
  ["x", "like this post", "X07"],
  ["x", "unlike this post", "X08"],
];
// Ten phrasing/recognizer variants per sampled action. Separate speaker qualification remains required.
const variants = (text: string) => [
  text,
  `please ${text}`,
  `${text} please`,
  `could you ${text}`,
  `can you ${text}`,
  `would you ${text}`,
  `could you please ${text}`,
  `${text}.`,
  text.toUpperCase(),
  text.replaceAll(" ", "  "),
];
describe("210 deterministic development phrases", () => {
  for (const [site, base, id] of positives)
    it.each(variants(base))(`${id}: %s`, (text) =>
      expect(parseSite(text, snapshot(site))?.action).toBe(id),
    );
});
