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
    '<aside id="pane-side"><input aria-label="Search chats"><div role="row">Mira</div><div role="row">Sam</div><button aria-pressed="false">Unread</button></aside><main id="main" data-chat-id="owned-chat"><header><span title="Mira">Mira</span></header><div role="log" data-testid="conversation-panel-messages"><div class="message-in">First message</div><div class="message-in">Latest message</div></div><footer><textarea aria-label="Message"></textarea><button>Send</button></footer></main>',
  gmail:
    '<div role="main"><h2 class="hP">Project update</h2><button>Reply</button><button>Archive</button><button>Mark as unread</button></div><div role="dialog" aria-label="New message"><span email="owned@example.test">Owned account</span><input name="to" aria-label="To"><input name="subjectbox" aria-label="Subject"><div contenteditable="true" aria-label="Message Body" role="textbox"></div><button>Send</button><button>Discard draft</button></div>',
  meet: '<main><h1 data-meeting-title>Test meeting</h1><button aria-label="Turn off microphone">Mic</button><button aria-label="Turn off camera">Camera</button><button aria-label="Turn on captions">Captions</button><button aria-label="Raise hand">Hand</button><button>Join now</button><aside data-panel-id="chat"><textarea aria-label="Send a message to everyone"></textarea><button>Send</button></aside></main>',
  linkedin:
    '<main><div class="jobs-details"><h1 class="job-details-jobs-unified-top-card__job-title">Data analyst at Test company</h1><button aria-label="Save" aria-pressed="false">Save</button><div class="jobs-description__content">Owned test job details</div></div><a class="job-card-list__title--link" href="/jobs/view/123">Data analyst at Test company</a><button aria-checked="false">Remote</button></main>',
  irctc:
    '<app-train-search><p-autocomplete id="origin"><input aria-label="From" value="Chennai Central - MAS" aria-controls="from-options"><ul id="from-options" role="listbox"></ul></p-autocomplete><p-autocomplete id="destination"><input aria-label="To" value="Bengaluru City - SBC"></p-autocomplete><div id="jDate"><input aria-label="Journey date" value="18/11/2026"></div><select id="journeyClass"><option value="3A">AC 3 Tier (3A)</option><option value="SL">Sleeper (SL)</option></select><select id="journeyQuota"><option>GENERAL</option><option>TATKAL</option></select><button>Search</button><button>Swap stations</button><button>Book ticket</button></app-train-search><app-train-list></app-train-list>',
  maps: '<main role="main"><h1>Bengaluru Palace</h1><button data-item-id="address">Vasanth Nagar, Bengaluru</button><button data-item-id="oh">Open 10 AM to 5 PM</button><a class="hfpxzc" aria-label="Bengaluru Palace" href="/maps/place/Palace">Bengaluru Palace</a><div id="directions-searchbox-0"><input value="Bengaluru Palace"></div><div id="directions-searchbox-1"><input value="Bengaluru airport"></div><button role="radio" aria-checked="true">Driving</button><button role="radio" aria-checked="false">Walking</button><button aria-label="Zoom in">+</button><div aria-label="Map" data-map-zoom="10"></div><div data-trip-index="0" aria-selected="false">Driving, 50 minutes</div></main>',
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
              whatsapp: "owned-chat",
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
describe("saved WhatsApp routine messages", () => {
  const message = { recipient: { identity: "owned-chat", label: "Mira" }, text: "I arrived safely. Send scroll down is literal." };
  it("sends the saved message once without test-recipient setup or another confirmation", async () => {
    const engine = fixture("whatsapp");
    const { editor, click } = hookSend("whatsapp");
    (editor as HTMLTextAreaElement).value = "";
    expect((await engine.sendRoutineMessage(message, "routine-send-1")).state).toBe("available");
    expect(document.querySelector(".message-out")?.textContent).toBe(message.text);
    expect((await engine.sendRoutineMessage(message, "routine-send-1")).state).toBe("available");
    expect(click).toHaveBeenCalledTimes(1);
  });
  it.each(["wrong identity", "wrong name", "missing identity", "existing draft", "chat changes during insertion"])("does not send when %s", async reason => {
    const engine = fixture("whatsapp");
    const { editor, click } = hookSend("whatsapp");
    (editor as HTMLTextAreaElement).value = reason === "existing draft" ? "Keep my unsent message" : "";
    if (reason === "wrong identity") document.querySelector("#main")!.setAttribute("data-chat-id", "someone-else");
    if (reason === "wrong name") document.querySelector("#main header span")!.textContent = "Sam";
    if (reason === "missing identity") document.querySelector("#main")!.removeAttribute("data-chat-id");
    if (reason === "chat changes during insertion") editor.addEventListener("input", () => document.querySelector("#main")!.setAttribute("data-chat-id", "someone-else"));
    expect((await engine.sendRoutineMessage(message, "routine-send-2")).state).not.toBe("available");
    expect(click).not.toHaveBeenCalled();
    if (reason === "existing draft") expect((editor as HTMLTextAreaElement).value).toBe("Keep my unsent message");
  });
  it("captures the exact draft and recipient without sending", () => {
    const engine = fixture("whatsapp");
    const { editor, click } = hookSend("whatsapp");
    (editor as HTMLTextAreaElement).value = message.text;
    expect(engine.whatsappDraft()).toEqual(message);
    expect(click).not.toHaveBeenCalled();
  });
  it("does not retry a send with an uncertain outcome", async () => {
    const engine = fixture("whatsapp");
    const { editor, button } = hookSend("whatsapp");
    (editor as HTMLTextAreaElement).value = "";
    const clicked = vi.fn(() => {
      // Chat switches synchronously as Send is activated: its outcome is unknown.
      document.querySelector("#main")!.setAttribute("data-chat-id", "changed-chat");
    });
    button.onclick = clicked;
    expect((await engine.sendRoutineMessage(message, "uncertain-send")).state).toBe("failed");
    document.querySelector("#main")!.setAttribute("data-chat-id", "owned-chat");
    expect((await engine.sendRoutineMessage(message, "another-attempt")).state).toBe("failed");
    expect(clicked).toHaveBeenCalledTimes(1);
  });
  it("cancellation during draft insertion cannot send later", async () => {
    const engine = fixture("whatsapp");
    const { editor, click } = hookSend("whatsapp");
    (editor as HTMLTextAreaElement).value = "";
    editor.addEventListener("input", () => engine.cancel());
    expect((await engine.sendRoutineMessage(message, "cancel-send")).state).not.toBe("available");
    expect(click).not.toHaveBeenCalled();
  });
  it("waits for the Send control to appear after inserting the saved draft", async () => {
    const engine = fixture("whatsapp");
    const { editor, button, click } = hookSend("whatsapp");
    (editor as HTMLTextAreaElement).value = "";
    const footer = button.parentElement!;
    button.remove();
    setTimeout(() => footer.append(button), 60);
    expect((await engine.sendRoutineMessage(message, "delayed-send-control")).state).toBe("available");
    expect(click).toHaveBeenCalledTimes(1);
  });
});
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
    ).toHaveLength(70);
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
        '<div data-journey-summary>MAS SBC 18/11/2026 AC 3 Tier (3A) GENERAL</div><article data-train-number="12627">Train 12627</article>';
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
    expect(preview.state).toBe("available");
    expect(preview.navigate?.url).toContain(
      "origin=bengaluru+palace&destination=bengaluru+airport",
    );
    expect((await engine.run(req(engine, "review directions"))).state).toBe(
      "needs-confirmation",
    );
    expect((await engine.dialogue("confirm"))?.evidence).toBe(
      "resolved-route-endpoints",
    );
    expect(
      (await engine.run(req(engine, "get directions from home to the airport")))
        .state,
    ).toBe("needs-choice");
  });
  it("verifies route mode against unchanged endpoints and a fresh route summary", async () => {
    const engine = fixture("maps");
    const button = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    ].find((e) => e.textContent === "Walking")!;
    button.onclick = () => {
      button.setAttribute("aria-checked", "true");
      [...document.querySelectorAll('[role="radio"]')]
        .filter((e) => e !== button)
        .forEach((e) => e.setAttribute("aria-checked", "false"));
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

it("same-name chat replacement invalidates approval by stable recipient ID", async () => {
  const engine = fixture("whatsapp", true),
    { click } = hookSend("whatsapp");
  await engine.run(req(engine, "send this message"));
  document
    .querySelector("#main")!
    .setAttribute("data-chat-id", "different-chat");
  await engine.dialogue("confirm");
  expect(click).not.toHaveBeenCalled();
});
it("a display name cannot authorize sending when stable chat identity is unavailable", async () => {
  const engine = fixture("whatsapp", true),
    { click } = hookSend("whatsapp");
  document.querySelector("#main")!.removeAttribute("data-chat-id");
  expect((await engine.run(req(engine, "send this message"))).state).toBe(
    "not-implemented",
  );
  expect(click).not.toHaveBeenCalled();
});
it("WhatsApp searches chats absent from the rendered list before opening", async () => {
  const engine = fixture("whatsapp");
  document.querySelector<HTMLInputElement>(
    '[aria-label="Search chats"]',
  )!.oninput = () => {
    const row = document.createElement("div");
    row.setAttribute("role", "row");
    row.textContent = "Unrendered contact";
    row.onclick = () =>
      (document.querySelector("header span")!.textContent = row.textContent);
    document.querySelector("#pane-side")!.append(row);
  };
  expect(
    (await engine.run(req(engine, "open my chat with Unrendered contact")))
      .state,
  ).toBe("available");
});
it("Gmail selected draft binds field focus across multiple compose windows", async () => {
  const engine = fixture("gmail", true);
  document
    .querySelector('[role="dialog"]')!
    .insertAdjacentHTML(
      "afterend",
      document
        .querySelector('[role="dialog"]')!
        .outerHTML.replace("New message", "Second message"),
    );
  expect(
    (await engine.run(req(engine, "switch to the other draft"))).state,
  ).toBe("needs-choice");
  await engine.dialogue("choose two");
  expect((await engine.run(req(engine, "write the body"))).focusField).toBe(
    true,
  );
  expect(
    document
      .querySelectorAll('[role="dialog"]')[1]
      .contains(document.activeElement),
  ).toBe(true);
});
it("Gmail guarded sending accepts an explicitly bound inline reply editor", async () => {
  const engine = fixture("gmail", true);
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  dialog.removeAttribute("role");
  dialog.setAttribute("data-reply-editor", "");
  document.querySelector('[role="main"]')!.append(dialog);
  const editor = dialog.querySelector<HTMLElement>("[contenteditable]")!;
  editor.textContent = "Owned reply";
  const button = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(
    (e) => e.textContent === "Send",
  )!;
  const click = vi.fn(() => {
    const alert = document.createElement("div");
    alert.setAttribute("role", "alert");
    alert.textContent = "Message sent";
    document.body.append(alert);
    editor.textContent = "";
  });
  button.onclick = click;
  expect((await engine.run(req(engine, "send this email"))).state).toBe(
    "needs-confirmation",
  );
  expect((await engine.dialogue("confirm"))?.state).toBe("available");
  expect(click).toHaveBeenCalledTimes(1);
});

it("searches even when a matching chat is already rendered and clarifies hidden duplicates", async () => {
  const engine = fixture("whatsapp");
  const opened = vi.fn();
  document
    .querySelectorAll<HTMLElement>('[role="row"]')
    .forEach((row) => (row.onclick = opened));
  document.querySelector<HTMLInputElement>(
    '[aria-label="Search chats"]',
  )!.oninput = () => {
    setTimeout(
      () =>
        document
          .querySelector("#pane-side")!
          .insertAdjacentHTML("beforeend", '<div role="row">Mira</div>'),
      80,
    );
  };
  expect((await engine.run(req(engine, "open my chat with Mira"))).state).toBe(
    "needs-choice",
  );
  expect(opened).not.toHaveBeenCalled();
});
it.each(["linkedin", "irctc"] as const)(
  "cancellation prevents selecting a newly opened %s option",
  async (site) => {
    const engine = fixture(site);
    const clicked = vi.fn();
    if (site === "linkedin")
      document.querySelector("main")!.innerHTML =
        "<button>On-site/Remote</button>";
    else
      document.querySelector("#journeyQuota")!.outerHTML =
        '<div id="journeyQuota" role="combobox">GENERAL</div>';
    const opener =
      site === "linkedin"
        ? document.querySelector("main button")!
        : document.querySelector("#journeyQuota")!;
    (opener as HTMLElement).onclick = () => {
      const option = document.createElement("button");
      option.textContent = site === "linkedin" ? "Remote" : "TATKAL";
      option.onclick = clicked;
      document.body.append(option);
      engine.cancel();
    };
    expect(
      (
        await engine.run(
          req(
            engine,
            site === "linkedin" ? "filter for remote jobs" : "choose Tatkal",
          ),
        )
      ).state,
    ).toBe("failed");
    expect(clicked).not.toHaveBeenCalled();
  },
);
it("does not verify train results with a different class or quota", async () => {
  const engine = fixture("irctc");
  document.querySelector<HTMLButtonElement>(
    "app-train-search button",
  )!.onclick = () => {
    document.querySelector("app-train-list")!.innerHTML =
      '<div data-journey-summary>MAS SBC 18/11/2026 Sleeper (SL) TATKAL</div><article data-train-number="12627">Train</article>';
  };
  await engine.run(req(engine, "search trains"));
  expect((await engine.dialogue("confirm"))?.state).toBe("failed");
});

it("cancellation prevents typing into a newly opened WhatsApp message search", async () => {
  const engine = fixture("whatsapp");
  const main = document.querySelector("#main")!;
  main.insertAdjacentHTML("beforeend", "<button>Search messages</button>");
  (main.lastElementChild as HTMLElement).onclick = () => {
    main.insertAdjacentHTML(
      "beforeend",
      '<input aria-label="Search messages">',
    );
    engine.cancel();
  };
  const request = req(engine, "search this chat for secret");
  expect(request.action).toBe("WA08");
  expect((await engine.run(request)).state).toBe("failed");
  expect(document.querySelector<HTMLInputElement>("#main input")!.value).toBe(
    "",
  );
});
it("cancellation prevents focusing a newly opened Gmail reply", async () => {
  const engine = fixture("gmail");
  const main = document.querySelector('[role="main"]')!;
  (main.querySelector("button") as HTMLElement).onclick = () => {
    main.insertAdjacentHTML(
      "beforeend",
      '<div contenteditable="true" aria-label="Message Body" role="textbox"></div>',
    );
    engine.cancel();
  };
  expect((await engine.run(req(engine, "reply to this email"))).state).toBe(
    "failed",
  );
  expect(document.activeElement).not.toBe(
    main.querySelector("[contenteditable]"),
  );
});

it.each(
  catalogue.filter((action) => Object.keys(bodies).includes(action.site)),
)("routes $id catalogue examples to their specific action", (action) => {
  const engine = fixture(action.site as BSite);
  for (const phrase of action.examples)
    expect(parseSite(phrase, engine.snapshot()!)?.action, phrase).toBe(
      action.id,
    );
});

describe("WhatsApp chat navigation layouts", () => {
  it("opens a rendered exact contact without requiring a search field or matching message previews", async () => {
    const engine = fixture("whatsapp");
    document.querySelector("input")!.remove();
    document.querySelector("#pane-side")!.innerHTML = '<div role="row"><span title="Mira">Mira</span><span>Mom called</span></div><div role="row"><span title="Mom">Mom</span></div>';
    const rows = document.querySelectorAll<HTMLElement>('[role="row"]');
    const wrong = vi.fn(); rows[0].onclick = wrong;
    rows[1].onclick = () => { document.querySelector("#main header")!.innerHTML = '<span title="Mom">Mom</span>'; };
    expect((await engine.run(req(engine, "open my chat with mom"))).state).toBe("available");
    expect(wrong).not.toHaveBeenCalled();
    expect(engine.snapshot()?.current?.label).toBe("Mom");
  });
  it("searches modern sidebar results and opens their nested chat control despite header tooltips", async () => {
    const engine = fixture("whatsapp");
    document.querySelector("#pane-side")!.remove();
    const side = document.createElement("aside"); side.id = "side";
    side.innerHTML = '<div aria-label="Search input textbox"><div contenteditable="true" role="textbox" aria-label="Search or start a new chat"></div></div><div role="list"></div>';
    document.body.prepend(side);
    side.querySelector('[contenteditable]')!.addEventListener("input", () => {
      setTimeout(() => {
        side.querySelector('[role="list"]')!.innerHTML = '<div role="listitem"><div role="button"><span title="Mom">Mom</span><span>Yesterday</span></div></div>';
        side.querySelector<HTMLElement>('[role="button"]')!.onclick = () => {
          document.querySelector("#main header")!.innerHTML = '<div data-testid="conversation-info-header-chat-title"><span title="Mom">Mom</span></div><button title="Search messages">Search</button>';
        };
      }, 1800);
    });
    expect((await engine.run(req(engine, "open chat with mom"))).state).toBe("available");
    expect(engine.snapshot()?.current?.label).toBe("Mom");
  });
});
describe('Meet natural controls',()=>{
 it('routes plain mic and camera phrases to desired-state actions',()=>{
  const e=fixture('meet');expect(req(e,'mute my mic')).toMatchObject({action:'ME02'});expect(req(e,'turn my camera off')).toMatchObject({action:'ME03',args:{mode:'off'}});
 });
 it('reports mic state without clicking and clears only the chat draft',async()=>{
  const e=fixture('meet');const mic=document.querySelector<HTMLButtonElement>('[aria-label="Turn off microphone"]')!;mic.onclick=vi.fn();
  expect((await e.run(req(e,'am I muted'))).feedback).toContain('on');expect(mic.onclick).not.toHaveBeenCalled();
  const editor=document.querySelector('textarea')!;editor.value='private draft';
  const clear=await e.run(req(e,'clear my chat draft'));expect(clear.state).toBe('available');expect(editor.value).toBe('');
 });
});
