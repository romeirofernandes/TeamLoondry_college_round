// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { SiteExecutor } from "../src/sites/executor";
import { catalogue, siteForUrl } from "../src/sites/catalogue";
import {
  parseSite,
  siteCandidates,
  makeRequest,
  numberSlot,
  timeSlot,
  unsafeSpeech,
  validateSiteRequest,
} from "../src/sites/language";
import { ContentRuntime } from "../src/content/runtime";
import { defaults } from "../src/shared";
import type { SiteId, SiteSnapshot } from "../src/sites/types";
const urls: Record<SiteId, string> = {
  wikipedia: "https://en.wikipedia.org/wiki/India",
  github: "https://github.com/demo/handsfree",
  reddit: "https://www.reddit.com/r/demo/",
  amazon: "https://www.amazon.in/dp/B000TEST",
  spotify: "https://open.spotify.com/search/demo",
  netflix: "https://www.netflix.com/browse",
  x: "https://x.com/home",
};
let time = 0;
beforeEach(() => {
  time = 0;
  document.body.innerHTML = "";
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 10,
    y: 10,
    top: 10,
    left: 10,
    bottom: 50,
    right: 150,
    width: 140,
    height: 40,
    toJSON() {},
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.restoreAllMocks());
function fixture(site: SiteId, html: string) {
  document.body.innerHTML = html;
  return new SiteExecutor(
    () => urls[site],
    () => time,
  );
}
function request(engine: SiteExecutor, phrase: string) {
  const snapshot = engine.context.inspect()!;
  const parsed = parseSite(phrase, snapshot);
  if (!parsed) throw new Error(`No site intent for ${phrase}`);
  return parsed;
}
const fixtures: Record<SiteId, string> = {
  wikipedia:
    '<h1 id="firstHeading">India</h1><main id="mw-content-text"><div class="mw-parser-output"><h2 id="History">History</h2><h2 id="Geography">Geography</h2><p>Climate description <a href="/wiki/Earth">Earth</a></p></div><ol class="references"><li id="cite1">Reference</li></ol></main>',
  github:
    '<main><strong itemprop="name">handsfree</strong><button aria-label="Star" aria-pressed="false">Star</button><table><tr role="row"><td><a href="/demo/handsfree/tree/main/src">src</a></td></tr><tr role="row"><td><a href="/demo/handsfree/blob/main/package.json">package.json</a></td></tr></table><form><input aria-label="Title"><textarea aria-label="Body"></textarea><button type="button">Create issue</button></form></main>',
  reddit:
    '<main><shreddit-post post-title="Keyboard discussion"><a href="/r/demo/comments/abc/keyboard">Keyboard discussion</a><button aria-label="Upvote" aria-pressed="false">Upvote</button><button aria-label="Downvote" aria-pressed="false">Downvote</button></shreddit-post></main>',
  amazon:
    '<main id="dp"><h1 id="productTitle">Test headphones</h1><div id="twister"><button aria-pressed="false">Black</button></div><select id="s-result-sort-select"><option value="low">Lowest price</option><option value="rating">Customer rating</option></select><section id="customerReviews">Reviews</section></main>',
  spotify:
    '<main><div data-testid="tracklist-row"><a href="/track/123" data-testid="track-name">Creep</a><span>Radiohead</span></div></main><div data-testid="now-playing-widget"><a data-testid="context-item-link" href="/track/123">Creep by Radiohead</a><button aria-label="Add to Liked Songs" aria-pressed="false">Save</button></div>',
  netflix:
    '<main><div class="title-card"><a href="/browse?jbv=123">Test title</a></div><div class="previewModal"><span class="title-title">Test title</span><button aria-label="I like this" aria-pressed="false">Like</button></div></main>',
  x: '<main><article data-testid="tweet"><div data-testid="tweetText">First test post</div><a href="/demo/status/111">Details</a><button aria-label="Like" aria-pressed="false">Like</button></article><article data-testid="tweet"><div data-testid="tweetText">Second test post</div><a href="/demo/status/222">Details</a><button aria-label="Like" aria-pressed="false">Like</button></article></main>',
};
describe("site contract", () => {
  it("has unique IDs and exact host boundaries, including X", () => {
    expect(new Set(catalogue.map((a) => a.id)).size).toBe(188);
    for (const [site, url] of Object.entries(urls))
      expect(siteForUrl(url)).toBe(site);
    for (const url of [
      "https://github.com.evil.test/",
      "https://evil.test/?site=netflix.com",
      "http://github.com/",
      "https://www.amazon.com/",
      "https://youtube.com/",
    ])
      expect(siteForUrl(url)).toBeNull();
  });
  it.each(Object.keys(fixtures) as SiteId[])(
    "inspects %s without field values in metadata",
    (site) => {
      const engine = fixture(
        site,
        fixtures[site] +
          '<input aria-label="Secret" value="PRIVATE_DRAFT"><input type="password" value="PASSWORD">',
      );
      const snapshot = engine.context.inspect()!;
      expect(snapshot.site).toBe(site);
      expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE_DRAFT|PASSWORD/);
      expect(snapshot.capabilities.length).toBeGreaterThan(0);
    },
  );
  it.each([
    ["wikipedia", "look up black holes", "W01"],
    ["wikipedia", "take me to Geography section", "W04"],
    ["github", "open the src folder", "G05"],
    ["github", "open package dot json", "G06"],
    ["github", "open issue forty-two", "G12"],
    ["reddit", "like the video", "R12"],
    ["amazon", "only show items under two thousand rupees", "A03"],
    ["amazon", "choose black", "A08"],
    ["spotify", "hold the music", "S06"],
    ["spotify", "skip this track", "S08"],
    ["spotify", "jump to two minutes ten", "S14"],
    ["netflix", "pause this episode", "N06"],
    ["netflix", "next episode", "N19"],
    ["x", "like this post", "X07"],
  ])("routes %s phrase %s before generic rules", (site, phrase, id) => {
    const engine = fixture(site as SiteId, fixtures[site as SiteId]);
    expect(request(engine, phrase).action).toBe(id);
  });
  it.each([
    "do not like this video",
    "don't post it",
    "I like this song's lyrics",
    "how do I like a video",
    'write "like the video"',
    "checkout",
    "merge this pull request",
    "delete my account",
  ])("never supplies write candidates for %s", (phrase) => {
    const engine = fixture("netflix", fixtures.netflix);
    expect(parseSite(phrase, engine.context.inspect()!)).toBeNull();
    expect(siteCandidates(phrase, engine.context.inspect()!)).toEqual({});
    expect(unsafeSpeech(phrase)).toBe(true);
  });
  it("bounds time, ordinal, percentage and INR slots without provider-generated strings", () => {
    expect(numberSlot("two thousand")).toBe(2000);
    expect(numberSlot("forty-two")).toBe(42);
    expect(timeSlot("two minutes ten")).toBe(130);
    expect(timeSlot("half a minute")).toBe(30);
    expect(timeSlot("1:99")).toBeNull();
    expect(numberSlot("minus two")).toBeNull();
    const engine = fixture("spotify", fixtures.spotify);
    expect(
      parseSite(
        "set volume to one hundred ten percent",
        engine.context.inspect()!,
      ),
    ).toBeNull();
    expect(
      parseSite("go forward one thousand seconds", engine.context.inspect()!),
    ).toBeNull();
    const valid = request(engine, "pause the song");
    expect(validateSiteRequest({ ...valid, args: { value: NaN } })).toBeNull();
    expect(validateSiteRequest({ ...valid, action: "purchase" })).toBeNull();
    expect(validateSiteRequest({ ...valid, revision: -1 })).toBeNull();
  });
});
describe("voice dialogue and account guard", () => {
  it.each([
    ["github", "star this repository"],
    ["reddit", "like this post"],
    ["spotify", "like this song"],
    ["netflix", "like this video"],
  ] as const)(
    "confirms %s desired state once and does not toggle on repetition",
    async (site, phrase) => {
      const engine = fixture(site, fixtures[site]),
        button = document.querySelector<HTMLButtonElement>(
          "button[aria-pressed]",
        )!;
      let clicks = 0;
      button.addEventListener("click", () => {
        clicks++;
        button.setAttribute("aria-pressed", "true");
      });
      expect((await engine.run(request(engine, phrase))).state).toBe(
        "needs-confirmation",
      );
      expect(clicks).toBe(0);
      expect((await engine.dialogue("confirm"))?.state).toBe("available");
      expect(clicks).toBe(1);
      expect((await engine.run(request(engine, phrase))).state).toBe(
        "already-satisfied",
      );
      expect(clicks).toBe(1);
    },
  );
  it("grounds X choices in the announced post list and never uses pointer location", async () => {
    const engine = fixture("x", fixtures.x);
    let clicks = 0;
    document.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        clicks++;
        b.setAttribute("aria-pressed", "true");
      }),
    );
    expect((await engine.run(request(engine, "like this post"))).state).toBe(
      "needs-choice",
    );
    const listing = await engine.dialogue("list results");
    expect(listing?.feedback).toContain("1. First test post");
    const chosen = await engine.dialogue("the second one");
    expect(chosen?.navigate?.url).toContain("/status/222");
    expect((await engine.run(request(engine, "like this post"))).state).toBe(
      "needs-confirmation",
    );
    expect(clicks).toBe(0);
    await engine.dialogue("confirm");
    expect(clicks).toBe(1);
    expect(
      document.querySelectorAll("button")[1].getAttribute("aria-pressed"),
    ).toBe("true");
  });
  it.each(["cancel", "expired", "rerender", "navigation", "new-request"])(
    "rejects %s pending confirmations",
    async (change) => {
      let url = urls.github;
      document.body.innerHTML = fixtures.github;
      const engine = new SiteExecutor(
          () => url,
          () => time,
        ),
        button = document.querySelector<HTMLButtonElement>("button")!,
        click = vi.fn();
      button.addEventListener("click", click);
      await engine.run(request(engine, "star this repository"));
      if (change === "cancel") await engine.dialogue("cancel");
      if (change === "expired") time = 16000;
      if (change === "rerender") button.outerHTML = button.outerHTML;
      if (change === "navigation") url += "?other";
      if (change === "new-request")
        await engine.run(request(engine, "open the src folder"));
      await engine.dialogue("confirm");
      expect(click).not.toHaveBeenCalled();
    },
  );
  it("does not retry a mutation with an uncertain result", async () => {
    const engine = fixture("github", fixtures.github),
      button = document.querySelector<HTMLButtonElement>("button")!,
      click = vi.fn();
    button.addEventListener("click", click);
    await engine.run(request(engine, "star this repository"));
    expect((await engine.dialogue("confirm"))?.state).toBe("failed");
    expect(click).toHaveBeenCalledTimes(1);
    await engine.run(request(engine, "star this repository"));
    expect((await engine.dialogue("confirm"))?.state).toBe("failed");
    expect(click).toHaveBeenCalledTimes(1);
  });
  it("does not confirm changed draft contents or duplicate a custom-handler publication", async () => {
    const engine = fixture("github", fixtures.github),
      input = document.querySelector<HTMLInputElement>("input")!,
      button = [...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Create issue",
      )!;
    input.value = "Test draft";
    let posts = 0;
    button.addEventListener("click", () => {
      posts++;
      const created = document.createElement("h2");
      created.dataset.testid = "issue-title";
      created.textContent = input.value;
      document.querySelector("main")!.append(created);
    });
    await engine.run(request(engine, "submit this issue"));
    input.value = "Changed";
    expect((await engine.dialogue("confirm"))?.state).toBe("unavailable");
    expect(posts).toBe(0);
    const r = request(engine, "submit this issue");
    await engine.run(r);
    expect((await engine.dialogue("confirm"))?.state).toBe("available");
    await engine.run(r, true);
    expect(posts).toBe(1);
  });
  it("blocks duplicate, hidden, disabled and background-modal controls", async () => {
    const engine = fixture("github", fixtures.github);
    const button = document.querySelector("button")!;
    button.insertAdjacentHTML("afterend", button.outerHTML);
    expect(
      (await engine.run(request(engine, "star this repository"))).state,
    ).toBe("unavailable");
    button.nextElementSibling!.setAttribute("hidden", "");
    expect(
      (await engine.run(request(engine, "star this repository"))).state,
    ).toBe("needs-confirmation");
    await engine.dialogue("cancel");
    button.setAttribute("disabled", "");
    expect(
      (await engine.run(request(engine, "star this repository"))).state,
    ).toBe("unavailable");
    button.removeAttribute("disabled");
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div role="dialog" aria-modal="true">Blocking modal</div>',
    );
    expect(
      (await engine.run(request(engine, "star this repository"))).state,
    ).not.toBe("needs-confirmation");
  });
  it("selects named fields and keeps command words literal until reserved dictation exit", async () => {
    // Actual content runtime integration, no face or pointer samples.
    document.body.innerHTML = fixtures.github;
    vi.stubGlobal("location", { href: urls.github });
    const sent: any[] = [];
    const runtime = new ContentRuntime(
      async (m) => {
        sent.push(m);
      },
      () => time,
      false,
    );
    await runtime.handle({
      type: "PAGE_STATE",
      running: true,
      paused: false,
      dictating: false,
      settings: { ...defaults, voiceOnly: true },
    });
    const snapshot = (await runtime.handle({
      type: "GET_SITE_CONTEXT",
    })) as SiteSnapshot;
    const intent = parseSite("write the issue title", snapshot)!;
    expect(
      ((await runtime.handle({ type: "PAGE_ACTION", intent })) as any)
        .dictating,
    ).toBe(true);
    await runtime.handle({
      type: "DICTATE",
      text: "scroll down send like this cancel",
    });
    expect(document.querySelector<HTMLInputElement>("input")!.value).toContain(
      "scroll down send like this cancel",
    );
    await runtime.handle({
      type: "PAGE_ACTION",
      intent: { type: "stop-typing" },
    });
    runtime.destroy();
    vi.unstubAllGlobals();
  });
});

it("uses an announced ordinal for open-result phrasing and rejects a stale list", async () => {
  const engine = fixture("x", fixtures.x);
  await engine.dialogue("list results");
  expect(
    (await engine.run(request(engine, "open the second post"))).navigate?.url,
  ).toContain("/status/222");
  await engine.dialogue("list results");
  document.querySelector("article")!.remove();
  expect((await engine.dialogue("choose two"))?.state).toBe("unavailable");
});
