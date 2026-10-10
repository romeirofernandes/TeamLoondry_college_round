// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SiteExecutor } from "../src/sites/executor";
import { siteForUrl, siteHomes, catalogue } from "../src/sites/catalogue";
import { parseSite, makeRequest, siteCandidates } from "../src/sites/language";
import { journeyDate } from "../src/sites/group-b";
import { defaults, normalizeControlSettings } from "../src/shared";
import type { SiteId } from "../src/sites/types";
let clock = 0;
beforeEach(() => {
  clock = 0;
  document.body.innerHTML = "";
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 10,
    y: 10,
    top: 10,
    left: 10,
    bottom: 60,
    right: 200,
    width: 190,
    height: 50,
    toJSON() {},
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.restoreAllMocks());
const bodies = {
  whatsapp:
    '<aside id="pane-side"><div role="row">Mira</div><div role="row">Sam</div><button aria-pressed="false">Unread</button></aside><main id="main"><header><span title="Mira">Mira</span></header><div role="log" data-testid="conversation-panel-messages"><div class="message-in">First message</div><div class="message-in">Latest message</div></div><footer><textarea aria-label="Message"></textarea><button>Send</button></footer></main>',
  gmail:
    '<div role="main"><h2 class="hP">Project update</h2><button>Reply</button><button>Archive</button><button>Mark as unread</button></div><div role="dialog" aria-label="New message"><span email="owned@example.test">Owned account</span><input name="to" aria-label="To"><input name="subjectbox" aria-label="Subject"><div contenteditable="true" aria-label="Message Body" role="textbox"></div><button>Send</button><button>Discard draft</button></div>',
  meet: '<main><h1 data-meeting-title>Test meeting</h1><button aria-label="Turn off microphone">Mic</button><button aria-label="Turn off camera">Camera</button><button aria-label="Turn on captions">Captions</button><button aria-label="Raise hand">Hand</button><button>Join now</button><aside data-panel-id="chat"><textarea aria-label="Send a message to everyone"></textarea><button>Send</button></aside></main>',
  linkedin:
    '<main><div class="jobs-details"><h1 class="job-details-jobs-unified-top-card__job-title">Data analyst at Test company</h1><button aria-label="Save" aria-pressed="false">Save</button><div class="jobs-description__content">Owned test job details</div></div><a class="job-card-list__title--link" href="/jobs/view/123">Data analyst at Test company</a><button aria-checked="false">Remote</button></main>',
  irctc:
    '<app-train-search><p-autocomplete id="origin"><input aria-label="From" value="Chennai Central - MAS" aria-controls="from-options"><ul id="from-options" role="listbox"></ul></p-autocomplete><p-autocomplete id="destination"><input aria-label="To" value="Bengaluru City - SBC"></p-autocomplete><div id="jDate"><input aria-label="Journey date" value="18/11/2026"></div><select id="journeyClass"><option value="3A">AC 3 Tier (3A)</option><option value="SL">Sleeper (SL)</option></select><select id="journeyQuota"><option>GENERAL</option><option>TATKAL</option></select><button>Search</button><button>Swap stations</button><button>Book ticket</button></app-train-search><app-train-list></app-train-list>',
  maps: '<main role="main"><h1>Bengaluru Palace</h1><button data-item-id="address">Vasanth Nagar, Bengaluru</button><button data-item-id="oh">Open 10 AM to 5 PM</button><a class="hfpxzc" aria-label="Bengaluru Palace" href="/maps/place/Palace">Bengaluru Palace</a><div id="directions-searchbox-0"><input value="Bengaluru Palace"></div><div id="directions-searchbox-1"><input value="Bengaluru airport"></div><button role="radio" aria-checked="false">Walking</button><button aria-label="Zoom in">+</button><div aria-label="Map" data-map-zoom="10"></div><div data-trip-index="0" aria-selected="false">Driving, 50 minutes</div></main>',
};
type BSite = keyof typeof bodies;
const urls = { ...siteHomes, meet: "https://meet.google.com/abc-defg-hij" };
function fixture(site: BSite, allowed = false) {
  document.body.innerHTML = bodies[site];
  return new SiteExecutor(
    () => urls[site],
    () => clock,
    () => true,
    (target, recipients) =>
      allowed &&
      target === site &&
      recipients.every(
        (r) =>
          (
            ({
              whatsapp: "mira",
              gmail: "owned@example.test",
              meet: "abc-defg-hij",
            }) as Record<string, string>
          )[site] === r.toLowerCase(),
      ),
  );
}
function req(engine: SiteExecutor, text: string) {
  const parsed = parseSite(text, engine.snapshot()!);
  if (!parsed) throw Error(`No intent: ${text}`);
  return parsed;
}
function hookSend(site: "whatsapp" | "gmail" | "meet") {
  const root = document.querySelector(
    site === "whatsapp"
      ? "#main"
      : site === "gmail"
        ? '[role="dialog"]'
        : '[data-panel-id="chat"]',
  )!;
  const editor = root.querySelector<HTMLTextAreaElement | HTMLDivElement>(
    'textarea,[contenteditable="true"]',
  )!;
  const button = [...root.querySelectorAll("button")].find(
    (b) => b.textContent === "Send",
  )!;
  const click = vi.fn(() => {
    const text =
      editor instanceof HTMLTextAreaElement ? editor.value : editor.textContent;
    const message = document.createElement("div");
    if (site === "gmail") {
      message.setAttribute("role", "alert");
      message.textContent = "Message sent";
      document.body.append(message);
    } else {
      if (site === "whatsapp") message.className = "message-out";
      else
        message.setAttribute("data-message-id", "test-" + root.children.length);
      message.textContent = text;
      root.append(message);
    }
    if (editor instanceof HTMLTextAreaElement) editor.value = "";
    else editor.textContent = "";
  });
  button.onclick = click;
  if (editor instanceof HTMLTextAreaElement)
    editor.value = "Literal send scroll down";
  else editor.textContent = "Literal send scroll down";
  return { editor, button, click };
}
describe("Group B boundaries and commands", () => {
  it.each(Object.keys(bodies) as BSite[])(
    "matches %s and rejects deceptive hosts",
    (site) => {
      expect(siteForUrl(urls[site])).toBe(site);
      expect(
        siteForUrl(
          urls[site].replace(
            new URL(urls[site]).hostname,
            new URL(urls[site]).hostname + ".evil.test",
          ),
        ),
      ).toBeNull();
    },
  );
  it("limits the Google adapter to Maps paths", () => {
    expect(siteForUrl("https://www.google.com/search?q=map")).toBeNull();
    expect(siteForUrl("https://www.google.com/maps/dir/")).toBe("maps");
  });
  it("has every Group B plan ID exactly once", () => {
    expect(
      catalogue.filter((a) => Object.keys(bodies).includes(a.site)),
    ).toHaveLength(64);
    expect(new Set(catalogue.map((a) => a.id)).size).toBe(catalogue.length);
  });
  it("normalizes owned recipients without accepting arbitrary sites", () => {
    expect(
      normalizeControlSettings({
        ...defaults,
        testMessageRecipients: [
          "gmail:OWNED@example.test",
          "gmail:OWNED@example.test",
          "meet:abc-defg-hij",
          "unknown:x",
          "whatsapp:mira",
        ],
      }).testMessageRecipients,
    ).toEqual([
      "gmail:owned@example.test",
      "meet:abc-defg-hij",
      "whatsapp:mira",
    ]);
  });
});
describe("bound sends", () => {
  for (const site of ["whatsapp", "gmail", "meet"] as const) {
    const phrase = {
      whatsapp: "send this message",
      gmail: "send this email",
      meet: "send this to the meeting",
    }[site];
    it(`${site}: denies unconfigured recipients`, async () => {
      const engine = fixture(site);
      const { click } = hookSend(site);
      expect((await engine.run(req(engine, phrase))).state).toBe(
        "not-implemented",
      );
      await engine.dialogue("confirm");
      expect(click).not.toHaveBeenCalled();
    });
    it(`${site}: cancels then sends once and verifies`, async () => {
      const engine = fixture(site, true);
      const { click } = hookSend(site);
      expect((await engine.run(req(engine, phrase))).state).toBe(
        "needs-confirmation",
      );
      await engine.dialogue("cancel");
      expect(click).not.toHaveBeenCalled();
      expect((await engine.run(req(engine, phrase))).state).toBe(
        "needs-confirmation",
      );
      expect((await engine.dialogue("confirm"))?.state).toBe("available");
      await engine.dialogue("confirm");
      expect(click).toHaveBeenCalledTimes(1);
    });
    it(`${site}: edited draft invalidates confirmation`, async () => {
      const engine = fixture(site, true);
      const { editor, click } = hookSend(site);
      await engine.run(req(engine, phrase));
      if (editor instanceof HTMLTextAreaElement) editor.value = "Changed text";
      else editor.textContent = "Changed text";
      expect((await engine.dialogue("confirm"))?.state).toBe("unavailable");
      expect(click).not.toHaveBeenCalled();
    });
    it(`${site}: expiration prevents sending`, async () => {
      const engine = fixture(site, true);
      const { click } = hookSend(site);
      await engine.run(req(engine, phrase));
      clock = 15001;
      await engine.dialogue("confirm");
      expect(click).not.toHaveBeenCalled();
    });
  }
  it("recipient-chip attribute changes expire a Gmail send", async () => {
    const engine = fixture("gmail", true);
    const { click } = hookSend("gmail");
    await engine.run(req(engine, "send this email"));
    document
      .querySelector("[email]")!
      .setAttribute("email", "other@example.test");
    await engine.dialogue("confirm");
    expect(click).not.toHaveBeenCalled();
  });
  it("chat header changes expire a WhatsApp send", async () => {
    const engine = fixture("whatsapp", true);
    const { click } = hookSend("whatsapp");
    await engine.run(req(engine, "send this message"));
    document.querySelector("header span")!.textContent = "Sam";
    await engine.dialogue("confirm");
    expect(click).not.toHaveBeenCalled();
  });
  it("rejects multiple Gmail drafts instead of guessing a recipient", async () => {
    const engine = fixture("gmail", true);
    const { click } = hookSend("gmail");
    document
      .querySelector('[role="dialog"]')!
      .insertAdjacentHTML(
        "afterend",
        document.querySelector('[role="dialog"]')!.outerHTML,
      );
    expect((await engine.run(req(engine, "send this email"))).state).toBe(
      "needs-choice",
    );
    expect(click).not.toHaveBeenCalled();
  });
  it("generic Send cannot bypass recipient and confirmation gates", () => {
    const engine = fixture("whatsapp", true);
    expect(
      engine.guardActivation(document.querySelector("footer button")!),
    ).toBe("blocked");
  });
  it("keeps a failed send uncertain and prevents repeating it", async () => {
    const engine = fixture("whatsapp", true);
    const { button } = hookSend("whatsapp");
    const click = vi.fn();
    button.onclick = click;
    await engine.run(req(engine, "send this message"));
    expect((await engine.dialogue("confirm"))?.state).toBe("failed");
    await engine.run(req(engine, "send this message"));
    expect((await engine.dialogue("confirm"))?.state).toBe("failed");
    expect(click).toHaveBeenCalledTimes(1);
  });
});
describe("WhatsApp, Gmail and Meet", () => {
  it("opens a named chat and reads only its latest message", async () => {
    const engine = fixture("whatsapp");
    document.querySelectorAll<HTMLElement>('[role="row"]').forEach(
      (row) =>
        (row.onclick = () => {
          document.querySelector("header span")!.textContent = row.textContent;
        }),
    );
    expect((await engine.run(req(engine, "open my chat with Sam"))).state).toBe(
      "available",
    );
    expect(
      (await engine.run(req(engine, "read the latest message"))).feedback,
    ).toBe("Latest message");
  });
  it("clarifies duplicate chat names", async () => {
    const engine = fixture("whatsapp");
    document
      .querySelector("#pane-side")!
      .insertAdjacentHTML("beforeend", '<div role="row">Mira</div>');
    expect(
      (await engine.run(req(engine, "open my chat with Mira"))).state,
    ).toBe("needs-choice");
  });
  it("focuses a chat draft without sending", async () => {
    const engine = fixture("whatsapp");
    expect((await engine.run(req(engine, "write a message"))).focusField).toBe(
      true,
    );
    expect(document.activeElement?.tagName).toBe("TEXTAREA");
  });
  it("Gmail search and inbox routes preserve the selected account", async () => {
    const engine = fixture("gmail");
    expect(
      (await engine.run(req(engine, "search Gmail for project update")))
        .navigate?.url,
    ).toBe("https://mail.google.com/mail/u/0/#search/project%20update");
    expect(
      (await engine.run(req(engine, "go back to inbox"))).navigate?.url,
    ).toContain("/mail/u/0/#inbox");
  });
  it.each(["recipient", "subject", "body"])(
    "Gmail focuses the distinct %s field",
    async (field) => {
      const engine = fixture("gmail");
      expect(
        (await engine.run(req(engine, "write the " + field))).focusField,
      ).toBe(true);
      expect(
        document.activeElement?.getAttribute(
          field === "body" ? "aria-label" : "name",
        ),
      ).toBe(
        field === "body"
          ? "Message Body"
          : field === "recipient"
            ? "to"
            : "subjectbox",
      );
    },
  );
  it.each([
    ["mute my meeting microphone", "Turn off microphone", "Turn on microphone"],
    ["turn my Meet camera off", "Turn off camera", "Turn on camera"],
    ["turn captions on", "Turn on captions", "Turn off captions"],
    ["raise my hand", "Raise hand", "Lower hand"],
  ])("Meet desired state: %s", async (phrase, initial, next) => {
    const engine = fixture("meet");
    const button = document.querySelector<HTMLButtonElement>(
      `[aria-label="${initial}"]`,
    )!;
    const click = vi.fn(() => button.setAttribute("aria-label", next));
    button.onclick = click;
    expect((await engine.run(req(engine, phrase))).state).toBe("available");
    expect((await engine.run(req(engine, phrase))).state).toBe(
      "already-satisfied",
    );
    expect(click).toHaveBeenCalledTimes(1);
  });
  it("joining uses a one-use preview of the meeting code", async () => {
    const engine = fixture("meet");
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Join now",
    )!;
    button.onclick = () => {
      button.textContent = "Leave call";
    };
    expect(
      (await engine.run(req(engine, "join this meeting"))).feedback,
    ).toContain("abc-defg-hij");
    expect((await engine.dialogue("confirm"))?.state).toBe("available");
  });
});
describe("LinkedIn, IRCTC and Maps", () => {
  it("saves and unsaves the same job without toggling repeats", async () => {
    const engine = fixture("linkedin");
    const button = document.querySelector<HTMLButtonElement>(
      '[aria-label="Save"]',
    )!;
    const click = vi.fn(() => {
      const saved = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(saved));
      button.setAttribute("aria-label", saved ? "Saved" : "Save");
    });
    button.onclick = click;
    await engine.run(req(engine, "save this job"));
    expect((await engine.dialogue("confirm"))?.state).toBe("available");
    expect((await engine.run(req(engine, "save this job"))).state).toBe(
      "already-satisfied",
    );
    await engine.run(req(engine, "unsave this job"));
    expect((await engine.dialogue("confirm"))?.state).toBe("available");
    expect(click).toHaveBeenCalledTimes(2);
  });
  it("selects a committed station suggestion and never just types an unverified station", async () => {
    const engine = fixture("irctc");
    const input = document.querySelector<HTMLInputElement>("#origin input")!;
    input.oninput = () => {
      document.querySelector("#from-options")!.innerHTML =
        '<li role="option">Chennai Central - MAS</li>';
      document.querySelector<HTMLElement>('[role="option"]')!.onclick = () =>
        (input.value = "Chennai Central - MAS");
    };
    expect(
      (await engine.run(req(engine, "set origin to Chennai Central"))).state,
    ).toBe("available");
    expect(input.value).toBe("Chennai Central - MAS");
  });
  it("announces ambiguous station suggestions and commits a numbered voice choice", async () => {
    const engine = fixture("irctc");
    const input = document.querySelector<HTMLInputElement>("#origin input")!;
    input.oninput = () => {
      document.querySelector("#from-options")!.innerHTML =
        '<li role="option">Chennai Central - MAS</li><li role="option">Chennai Egmore - MS</li>';
      for (const node of document.querySelectorAll<HTMLElement>(
        '[role="option"]',
      ))
        node.onclick = () => (input.value = node.textContent!);
    };
    expect((await engine.run(req(engine, "set origin to Chennai"))).state).toBe(
      "needs-choice",
    );
    expect((await engine.dialogue("choose two"))?.state).toBe("available");
    expect(input.value).toBe("Chennai Egmore - MS");
  });
  it.each(["31 February 2027", "18 November", "yesterday", "2020-01-01"])(
    "rejects ambiguous, invalid or past dates: %s",
    async (date) => {
      const engine = fixture("irctc");
      expect((await engine.run(req(engine, "travel on " + date))).state).toBe(
        "unavailable",
      );
    },
  );
  it("parses valid full dates and rejects leap-day overflow", () => {
    const today = new Date(2026, 9, 10);
    expect(journeyDate("18 November 2026", today)).toBe("18/11/2026");
    expect(journeyDate("2028-02-29", today)).toBe("29/02/2028");
    expect(journeyDate("2027-02-29", today)).toBeNull();
  });
  it("previews exact journey values and blocks stale search confirmation", async () => {
    const engine = fixture("irctc");
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Search",
    )!;
    const click = vi.fn();
    button.onclick = click;
    const preview = await engine.run(req(engine, "search trains"));
    expect(preview.state).toBe("needs-confirmation");
    expect(preview.feedback).toMatch(/MAS.*SBC.*18\/11\/2026/);
    document.querySelector<HTMLInputElement>("#destination input")!.value =
      "Chennai Central - MAS";
    await engine.dialogue("confirm");
    expect(click).not.toHaveBeenCalled();
  });
  it("requires fresh results matching station codes and date", async () => {
    const engine = fixture("irctc");
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Search",
    )!;
    button.onclick = () => {
      document.querySelector("app-train-list")!.innerHTML =
        '<div data-journey-summary>MAS SBC 18/11/2026</div><article data-train-number="12627">Train 12627</article>';
    };
    await engine.run(req(engine, "search trains"));
    expect((await engine.dialogue("confirm"))?.state).toBe("available");
  });
  it("rejects ticket booking and generic payment activation", async () => {
    const engine = fixture("irctc");
    expect((await engine.run(req(engine, "book this ticket"))).state).toBe(
      "not-implemented",
    );
    expect(
      engine.guardActivation(document.querySelector("button:last-child")!),
    ).toBe("blocked");
  });
  it("confirms named route endpoints and declines implicit home", async () => {
    const engine = fixture("maps");
    const preview = await engine.run(
      req(engine, "get directions from Bengaluru Palace to Bengaluru airport"),
    );
    expect(preview.state).toBe("needs-confirmation");
    const response = await engine.dialogue("confirm");
    expect(response?.navigate?.url).toContain(
      "origin=bengaluru+palace&destination=bengaluru+airport",
    );
    expect(
      (await engine.run(req(engine, "get directions from home to the airport")))
        .state,
    ).toBe("needs-choice");
  });
  it("verifies route mode against unchanged endpoints and a fresh route summary", async () => {
    const engine = fixture("maps");
    const button = document.querySelector<HTMLButtonElement>('[role="radio"]')!;
    button.onclick = () => {
      button.setAttribute("aria-checked", "true");
      document.querySelector("[data-trip-index]")!.textContent =
        "Walking, 4 hours";
    };
    expect((await engine.run(req(engine, "switch to walking"))).state).toBe(
      "available",
    );
  });
  it("verifies semantic map zoom independently of browser zoom", async () => {
    const engine = fixture("maps");
    document.querySelector<HTMLButtonElement>(
      '[aria-label="Zoom in"]',
    )!.onclick = () =>
      document
        .querySelector("[data-map-zoom]")!
        .setAttribute("data-map-zoom", "11");
    expect((await engine.run(req(engine, "zoom the map in"))).state).toBe(
      "available",
    );
  });
  it.each(["pan the map east", "start navigation"])(
    "reports desktop boundaries for %s",
    async (phrase) => {
      const engine = fixture("maps");
      expect((await engine.run(req(engine, phrase))).state).toBe(
        "not-implemented",
      );
    },
  );
});
