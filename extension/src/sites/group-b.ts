import type {
  ActionSpec,
  SiteRequest,
  SiteResult,
  SiteSnapshot,
  Entity,
} from "./types";
import type { SiteContext } from "./context";
import {
  controls,
  elements,
  editable,
  label,
  norm,
  setInput,
  stateOf,
  until,
  visible,
  insertText,
} from "./resolver";

const outcome = (
  state: SiteResult["state"],
  feedback: string,
  rest: Partial<SiteResult> = {},
): SiteResult => ({ state, feedback, ...rest });
const one = (selector: string, scope: ParentNode = document) => {
  const found = elements(selector, scope);
  return found.length === 1 ? found[0] : undefined;
};
const value = (node: HTMLElement) =>
  node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
    ? node.value
    : node.textContent || "";
const field = (names: string[], scope: ParentNode = document) => {
  const found = elements(
    'input,textarea,[contenteditable="true"]',
    scope,
  ).filter((e) => editable(e) && names.some((n) => norm(label(e)) === norm(n)));
  return found.length === 1 ? found[0] : undefined;
};
const chatEditor = (scope: ParentNode) =>
  one('footer [contenteditable="true"][role="textbox"],footer textarea', scope);
const mailBody = (scope: ParentNode) =>
  field(["Message Body", "Message body", "Body"], scope);
const meetingCode = (s: SiteSnapshot) =>
  /^\/([a-z]{3}-[a-z]{4}-[a-z]{3})\/?$/.exec(new URL(s.url).pathname)?.[1];
const meetChatEditor = (scope: ParentNode) =>
  field(["Send a message", "Send a message to everyone", "Message"], scope);
export const groupBSends = new Set(["WA06", "GM05", "ME08"]);
export type RecipientAllowed = (
  site: SiteSnapshot["site"],
  recipients: string[],
) => boolean;

function recipients(s: SiteSnapshot, scope: ParentNode): string[] {
  if (s.site === "whatsapp")
    return s.current?.kind === "chat" ? [s.current.label] : [];
  if (s.site === "meet") return meetingCode(s) ? [meetingCode(s)!] : [];
  if (s.site !== "gmail") return [];
  // Require committed recipient chips, not a pending suggestion or an uncommitted address.
  const chips = elements("[email],[data-email]", scope).filter(
    (e) => !e.closest('[role="listbox"]'),
  );
  const addresses = [
    ...new Set(
      chips.map((e) =>
        (
          e.getAttribute("email") ||
          e.getAttribute("data-email") ||
          ""
        ).toLowerCase(),
      ),
    ),
  ];
  if (addresses.some((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a))) return [];
  const pending = elements(
    'input[name="to"],input[name="cc"],input[name="bcc"]',
    scope,
  ).some((e) => value(e).trim());
  return pending ? [] : addresses;
}
function sendParts(s: SiteSnapshot, scope: ParentNode) {
  if (s.site === "whatsapp")
    return {
      editor: chatEditor(scope),
      names: ["Send"],
      selector: ".message-out",
      destination: recipients(s, scope),
    };
  if (s.site === "gmail")
    return {
      editor: mailBody(scope),
      names: ["Send", "Send ‪(Ctrl-Enter)‬"],
      selector: '[role="alert"]',
      destination: recipients(s, scope),
    };
  return {
    editor: meetChatEditor(scope),
    names: ["Send a message", "Send"],
    selector: '[data-message-id],[data-is-self="true"]',
    destination: recipients(s, scope),
  };
}
function dateValue(raw: string, today: Date): string | null {
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const named = /^(\d{1,2}) ([a-z]+) (\d{4})$/.exec(norm(raw));
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  const year = iso
    ? Number(iso[1])
    : named
      ? Number(named[3])
      : slash
        ? Number(slash[3])
        : NaN;
  const month = iso
    ? Number(iso[2]) - 1
    : named
      ? months.indexOf(named[2])
      : slash
        ? Number(slash[2]) - 1
        : -1;
  const day = iso
    ? Number(iso[3])
    : named
      ? Number(named[1])
      : slash
        ? Number(slash[1])
        : NaN;
  const date = new Date(year, month, day);
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  if (
    year < 2000 ||
    month < 0 ||
    month > 11 ||
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day ||
    date < start
  )
    return null;
  return `${String(day).padStart(2, "0")}/${String(month + 1).padStart(2, "0")}/${year}`;
}
export { dateValue as journeyDate };
const stationCode = (input: HTMLElement | undefined) =>
  input && /(?:^|[-(\s])([A-Z]{2,5})\)?$/.exec(value(input).trim())?.[1];
const origin = () =>
  one('#origin input,input[aria-label="From"],input[placeholder="From*"]');
const destination = () =>
  one('#destination input,input[aria-label="To"],input[placeholder="To*"]');
const journeyDay = () =>
  one(
    '#jDate input,input[aria-label="Journey date"],input[placeholder="Journey Date(dd/mm/yyyy)*"]',
  );
function journeySummary() {
  const from = origin(),
    to = destination(),
    day = journeyDay();
  const codeFrom = stationCode(from),
    codeTo = stationCode(to);
  if (
    !from ||
    !to ||
    !day ||
    !codeFrom ||
    !codeTo ||
    codeFrom === codeTo ||
    !dateValue(value(day), new Date())
  )
    return null;
  const klass = one("#journeyClass"),
    quota = one("#journeyQuota");
  const selectedLabel = (node: HTMLElement) =>
    node instanceof HTMLSelectElement
      ? node.selectedOptions[0]?.text || ""
      : label(node);
  if (!klass || !quota || !label(klass).trim() || !label(quota).trim())
    return null;
  return {
    from: value(from),
    to: value(to),
    date: value(day),
    className: selectedLabel(klass),
    quota: selectedLabel(quota),
  };
}
const meetingState = (id: string, args: SiteRequest["args"]) => {
  switch (id) {
    case "ME02":
      return {
        on: ["Turn off microphone", "Turn off microphone (ctrl + d)"],
        off: ["Turn on microphone", "Turn on microphone (ctrl + d)"],
        desired: !!args.mode?.startsWith("unmute"),
      };
    case "ME03":
      return {
        on: ["Turn off camera", "Turn off camera (ctrl + e)"],
        off: ["Turn on camera", "Turn on camera (ctrl + e)"],
        desired: args.mode === "on",
      };
    case "ME04":
      return {
        on: ["Turn off captions"],
        off: ["Turn on captions"],
        desired: args.mode === "on",
      };
    case "ME05":
      return {
        on: ["Lower hand"],
        off: ["Raise hand"],
        desired: args.mode === "raise",
      };
    default:
      return null;
  }
};
export interface PreparedB {
  target?: HTMLElement;
  preview?: string;
  result?: SiteResult;
}
/** Prepare all guarded operations before the executor binds its one-use confirmation. */
export function prepareGroupB(
  spec: ActionSpec,
  request: SiteRequest,
  s: SiteSnapshot,
  scope: ParentNode,
  allow: RecipientAllowed,
): PreparedB {
  const id = spec.id;
  if (groupBSends.has(id)) {
    const parts = sendParts(s, scope),
      buttons = controls(parts.names, scope);
    if (!parts.editor || !value(parts.editor).trim())
      return {
        result: outcome(
          "unavailable",
          "The selected draft is empty or unavailable.",
        ),
      };
    if (!parts.destination.length || !allow(s.site, parts.destination))
      return {
        result: outcome(
          "not-implemented",
          "Sending is enabled only for exact owned test recipients configured in the dashboard. No message was sent.",
        ),
      };
    if (buttons.length !== 1)
      return {
        result: outcome("unavailable", "A unique Send control is unavailable."),
      };
    const subject =
      s.site === "gmail" ? one('input[name="subjectbox"]', scope) : undefined;
    return {
      target: buttons[0],
      preview: `Send to ${parts.destination.join(", ")}${subject ? ", subject " + value(subject).slice(0, 100) : ""}. Draft: ${value(parts.editor).slice(0, 160)}.`,
    };
  }
  if (id === "IR05") {
    const summary = journeySummary(),
      buttons = controls(["Search", "Search trains"]);
    if (!summary || buttons.length !== 1)
      return {
        result: outcome(
          "unavailable",
          "Choose different exact station codes, a valid full future date, class and quota before searching.",
        ),
      };
    return {
      target: buttons[0],
      preview: `Search ${summary.from} to ${summary.to} on ${summary.date}, ${summary.className}, ${summary.quota}.`,
    };
  }
  if (id === "MAP04") {
    if (!request.args.query?.trim() || !request.args.mode?.trim())
      return {
        result: outcome(
          "needs-choice",
          "Say directions from an exact starting place to an exact destination.",
        ),
      };
    if (
      /^(?:home|work|here|my location|current location)$/.test(
        norm(request.args.query),
      ) ||
      /^(?:home|work|here|my location)$/.test(norm(request.args.mode))
    )
      return {
        result: outcome(
          "needs-choice",
          "Use exact place names or addresses. Saved places and current location are not inferred.",
        ),
      };
    return {
      preview: `Request directions from ${request.args.query} to ${request.args.mode}. Place resolution remains subject to the map's results.`,
    };
  }
  if (id === "LI06") {
    if (s.current?.kind !== "job")
      return {
        result: outcome(
          "needs-choice",
          "Open a specific job before changing its saved state.",
        ),
      };
    const buttons = controls(["Save", "Saved", "Unsave"], scope);
    if (buttons.length !== 1)
      return {
        result: outcome(
          "unavailable",
          "A unique job Save control is unavailable.",
        ),
      };
    const desired = request.args.mode !== "unsave",
      state = stateOf(buttons[0], ["Saved", "Unsave"], ["Save"]);
    if (state === desired)
      return {
        result: outcome(
          "already-satisfied",
          `This job is already ${desired ? "saved" : "unsaved"}.`,
        ),
      };
    if (state === null)
      return {
        result: outcome("unavailable", "The job's saved state is not exposed."),
      };
    return {
      target: buttons[0],
      preview: `${desired ? "Save" : "Unsave"} ${s.current.label}. ${s.current.detail}`,
    };
  }
  if (id === "ME01" || id === "ME10") {
    const code = meetingCode(s),
      buttons = controls(
        id === "ME01" ? ["Join now", "Ask to join"] : ["Leave call"],
      );
    if (!code || buttons.length !== 1)
      return {
        result: outcome(
          "unavailable",
          "Open the exact meeting and its unique join or leave control.",
        ),
      };
    return {
      target: buttons[0],
      preview: `${id === "ME01" ? "Join" : "Leave"} meeting ${code}. Only your own participation changes.`,
    };
  }
  if (id === "GM07" || id === "GM08") {
    if (!s.current)
      return {
        result: outcome("needs-choice", "Open a specific conversation first."),
      };
    const name =
      id === "GM07"
        ? request.args.mode?.startsWith("restore")
          ? "Move to Inbox"
          : "Archive"
        : request.args.mode === "read"
          ? "Mark as read"
          : "Mark as unread";
    const buttons = controls([name], scope);
    if (buttons.length !== 1)
      return {
        result: outcome(
          "unavailable",
          `The ${name} control is unavailable. Open its menu if needed.`,
        ),
      };
    return { target: buttons[0], preview: `${name}: ${s.current.label}.` };
  }
  if (id === "WA07" && request.args.mode === "cancel sending")
    return {
      result: outcome(
        "available",
        "Cancelled sending. The draft remains unchanged.",
      ),
    };
  if (id === "WA07" || id === "GM10") {
    if (id === "WA07" && !s.current)
      return {
        result: outcome(
          "needs-choice",
          "Open a specific chat before clearing its draft.",
        ),
      };
    const draft = id === "WA07" ? chatEditor(scope) : mailBody(scope);
    if (!draft)
      return {
        result: outcome("unavailable", "A unique draft is unavailable."),
      };
    const buttons =
      id === "GM10" ? controls(["Discard draft", "Discard"], scope) : [];
    if (id === "GM10" && buttons.length !== 1)
      return {
        result: outcome("unavailable", "The discard control is unavailable."),
      };
    return {
      target: buttons[0] || draft,
      preview: `Discard the selected ${s.site} draft. ${recipients(s, scope).join(", ")}`,
    };
  }
  return {};
}

export async function executeGroupB(
  spec: ActionSpec,
  request: SiteRequest,
  s: SiteSnapshot,
  scope: ParentNode,
  target: HTMLElement | undefined,
  valid: () => boolean,
  context: SiteContext,
): Promise<SiteResult> {
  const id = spec.id,
    args = request.args;
  const verified = async (check: () => boolean, feedback: string) =>
    (await until(check, valid))
      ? outcome("available", feedback, { evidence: "observed-postcondition" })
      : outcome(
          "failed",
          "The action's result could not be verified. No automatic retry.",
        );
  const focus = (node: HTMLElement | undefined) => {
    if (!node)
      return outcome(
        "unavailable",
        "A unique editable field is unavailable. Select the intended editor first.",
      );
    node.focus();
    return document.activeElement === node
      ? outcome(
          "available",
          `Dictating into ${label(node) || "the selected draft"}. Say finish dictation to exit.`,
          { focusField: true, evidence: "focused-editor" },
        )
      : outcome("failed", "The editor did not accept focus.");
  };
  const selectControl = async (names: string[], root: ParentNode = scope) => {
    const nodes = controls(names, root);
    if (nodes.length !== 1)
      return outcome(
        "unavailable",
        "That semantic control is unavailable or ambiguous. Open its panel or menu first.",
      );
    const node = nodes[0];
    if (stateOf(node, []) === true)
      return outcome(
        "already-satisfied",
        `${label(node)} is already selected.`,
      );
    node.click();
    return verified(
      () => stateOf(node, []) === true,
      `Selected ${label(node)}.`,
    );
  };
  if (groupBSends.has(id)) {
    if (!target || !visible(target))
      return outcome("unavailable", "The Send control changed.");
    const parts = sendParts(s, scope);
    if (!parts.editor)
      return outcome("unavailable", "The draft editor changed.");
    const text = value(parts.editor).trim(),
      before = new Set(
        elements(parts.selector, s.site === "gmail" ? document : scope),
      );
    target.click();
    const result = await verified(
      () => {
        if (s.site === "gmail")
          return (
            elements('[role="alert"]')
              .filter((e) => !before.has(e))
              .some((e) => /\bmessage sent\b/i.test(label(e))) &&
            (!parts.editor!.isConnected || !value(parts.editor!).trim())
          );
        const after = elements(parts.selector, scope).filter(
          (e) => !before.has(e),
        );
        return (
          after.length === 1 &&
          norm(after[0].textContent || "").includes(norm(text)) &&
          !value(parts.editor!).trim()
        );
      },
      s.site === "gmail"
        ? "Gmail reports Message sent. Sent-folder and recipient-inbox verification still require live account qualification."
        : "Exactly one outgoing message with the drafted text is visible in the bound conversation.",
    );
    return result;
  }
  if (["ME02", "ME03", "ME04", "ME05"].includes(id)) {
    const change = meetingState(id, args)!;
    if (!meetingCode(s))
      return outcome("unavailable", "Open an exact Meet meeting first.");
    const buttons = controls([...change.on, ...change.off]);
    if (buttons.length !== 1)
      return outcome(
        "unavailable",
        "The requested meeting control is unavailable or ambiguous.",
      );
    const state = stateOf(buttons[0], change.on, change.off);
    if (state === change.desired)
      return outcome(
        "already-satisfied",
        "The meeting control already has the requested state.",
      );
    if (state === null)
      return outcome("unavailable", "The meeting control's state is unknown.");
    buttons[0].click();
    return verified(() => {
      const changed = controls([...change.on, ...change.off]);
      return (
        changed.length === 1 &&
        stateOf(changed[0], change.on, change.off) === change.desired
      );
    }, "Verified the requested Meet state. Handsfree capture is separate.");
  }
  if (id === "ME01" || id === "ME10") {
    if (!target || !visible(target))
      return outcome("unavailable", "The meeting control changed.");
    target.click();
    return verified(
      () =>
        id === "ME01"
          ? controls(["Leave call"]).length === 1
          : !controls(["Leave call"]).length &&
            !!elements('[data-call-ended],[aria-label="You left the meeting"]')
              .length,
      id === "ME01"
        ? "Joined the selected meeting."
        : "Left the selected meeting.",
    );
  }
  if (id === "ME06") {
    const names =
      args.mode === "participants"
        ? ["Show everyone", "People"]
        : ["Chat with everyone", "Chat"];
    const buttons = controls(names);
    if (buttons.length !== 1)
      return outcome(
        "unavailable",
        "The meeting panel control is unavailable.",
      );
    const selector =
      args.mode === "participants"
        ? '[aria-label="People"],[data-panel-id="people"]'
        : '[aria-label="In-call messages"],[data-panel-id="chat"]';
    if (elements(selector).length)
      return outcome(
        "already-satisfied",
        "That meeting panel is already open.",
      );
    buttons[0].click();
    return verified(
      () => !!elements(selector).length,
      "Opened the requested meeting panel.",
    );
  }
  if (id === "ME07") return focus(meetChatEditor(scope));
  if (id === "WA05")
    return s.current
      ? focus(chatEditor(scope))
      : outcome("needs-choice", "Open a named chat first.");
  if (id === "WA03") {
    if (!s.current)
      return outcome("needs-choice", "Open a specific chat first.");
    const messages = elements(".message-in,.message-out", scope);
    const node = messages[messages.length - (args.mode === "previous" ? 2 : 1)];
    if (!node)
      return outcome(
        "unavailable",
        "That message is not rendered in this chat.",
      );
    return outcome(
      "available",
      (node.textContent || "").trim().slice(0, 1500),
      { evidence: "scoped-message" },
    );
  }
  if (id === "WA04") {
    if (!s.current) return outcome("needs-choice", "Open a chat first.");
    const pane = one(
      '[data-testid="conversation-panel-messages"],[role="log"]',
      scope,
    );
    if (!pane)
      return outcome(
        "unavailable",
        "The conversation's scroll pane is not exposed.",
      );
    const before = pane.scrollTop;
    const newest = args.mode?.startsWith("go to") || args.mode === "newer";
    const desired = newest
      ? Math.min(
          pane.scrollHeight - pane.clientHeight,
          before + pane.clientHeight,
        )
      : Math.max(0, before - pane.clientHeight);
    if (desired === before)
      return outcome(
        "already-satisfied",
        "The message pane is already at that boundary.",
      );
    pane.scrollTop = args.mode?.startsWith("go to")
      ? pane.scrollHeight
      : desired;
    return verified(
      () => pane.scrollTop !== before,
      "Scrolled the selected conversation's messages.",
    );
  }
  if (id === "WA02") {
    if (args.mode === "show unread chats")
      return selectControl(["Unread"], elements("#pane-side")[0] || document);
    const chats = s.entities.filter((e) => e.kind === "chat"),
      at = chats.findIndex(
        (e) => norm(e.label) === norm(s.current?.label || ""),
      );
    const next = at >= 0 ? chats[at + 1] : undefined;
    if (!next)
      return outcome(
        "unavailable",
        "The next chat is not available in the rendered list.",
      );
    const node = context.node(next.id);
    if (!node) return outcome("unavailable", "The chat list changed.");
    node.click();
    return verified(
      () => norm(context.inspect()?.current?.label || "") === norm(next.label),
      `Opened ${next.label}.`,
    );
  }
  if (id === "WA08") {
    const buttons = controls(["Search", "Search messages"], scope);
    if (buttons.length !== 1)
      return outcome(
        "unavailable",
        "The current chat's search control is unavailable.",
      );
    buttons[0].click();
    await until(() => !!field(["Search messages"], scope), valid);
    const input = field(["Search messages"], scope);
    if (!(input instanceof HTMLInputElement) || !args.query)
      return outcome(
        "unavailable",
        "A unique chat-search field is unavailable.",
      );
    setInput(input, args.query);
    return verified(
      () =>
        elements('[data-testid="search-message"]', scope).length > 0 &&
        input.value === args.query,
      "Chat search results are visible for the requested query.",
    );
  }
  if (id === "WA09") {
    const name =
      args.mode === "close" ? ["Close"] : ["Contact info", "Chat info"];
    const buttons = controls(name, args.mode === "close" ? document : scope);
    if (buttons.length !== 1)
      return outcome("unavailable", "The chat info control is unavailable.");
    buttons[0].click();
    return verified(
      () =>
        !!elements('[data-testid="chat-info-drawer"]').length ===
        (args.mode !== "close"),
      "Verified the chat-info panel state.",
    );
  }
  if (id === "WA07") {
    if (!target || !editable(target))
      return outcome("unavailable", "The draft changed.");
    target.focus();
    const selection = getSelection(),
      range = document.createRange();
    range.selectNodeContents(target);
    selection?.removeAllRanges();
    selection?.addRange(range);
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    )
      target.select();
    insertText(target, "");
    return verified(() => !value(target), "Cleared the selected chat draft.");
  }
  if (id === "GM01") {
    const url = new URL(s.url);
    url.hash = "search/" + encodeURIComponent(args.query || "");
    return args.query
      ? outcome("available", "Opening Gmail search for the requested query.", {
          navigate: { url: url.href, newTab: false },
        })
      : outcome("unavailable", "Say a search query.");
  }
  if (id === "GM03") {
    if (args.mode?.startsWith("go back")) {
      const url = new URL(s.url);
      url.hash = "inbox";
      return outcome("available", "Opening the inbox.", {
        navigate: { url: url.href, newTab: false },
      });
    }
    const buttons = controls(
      ["Expand all"],
      elements('[role="main"]')[0] || document,
    );
    if (buttons.length !== 1)
      return outcome(
        "unavailable",
        "The thread expansion control is unavailable.",
      );
    buttons[0].click();
    return verified(
      () => !!elements(".a3s", scope).length,
      "Message content is expanded.",
    );
  }
  if (id === "GM04") {
    if (args.mode?.startsWith("compose")) {
      const buttons = controls(["Compose"]);
      if (buttons.length !== 1)
        return outcome(
          "unavailable",
          "Gmail's Compose control is unavailable.",
        );
      const before = new Set(elements('[role="dialog"]'));
      buttons[0].click();
      return verified(
        () =>
          elements('[role="dialog"]').filter((e) => !before.has(e)).length ===
          1,
        "Opened one compose window. Say write recipient, write subject, or write body.",
      );
    }
    const dialogs = elements('[role="dialog"]');
    if (dialogs.length !== 1)
      return outcome(
        "needs-choice",
        "Select a specific compose window. Close unused compose windows before dictating.",
      );
    const node =
      args.mode === "subject"
        ? one('input[name="subjectbox"]', dialogs[0])
        : args.mode === "recipient"
          ? one('input[name="to"]', dialogs[0])
          : mailBody(dialogs[0]);
    return focus(node);
  }
  if (id === "GM06") {
    const buttons = controls(["Reply"], scope);
    if (buttons.length !== 1)
      return outcome(
        "needs-choice",
        "Select a single message to reply to. Reply all is not inferred.",
      );
    buttons[0].click();
    await until(() => !!mailBody(scope), valid);
    return focus(mailBody(scope));
  }
  if (id === "GM07" || id === "GM08" || id === "GM10") {
    if (!target || !visible(target))
      return outcome("unavailable", "The account control changed.");
    const actionLabel = label(target),
      before = s.current?.id;
    target.click();
    if (id === "GM10")
      return verified(
        () => !visible(scope as HTMLElement),
        "Discarded the selected compose window.",
      );
    if (id === "GM08")
      return verified(
        () =>
          controls(
            [args.mode === "read" ? "Mark as unread" : "Mark as read"],
            scope,
          ).length === 1,
        "Verified the requested message read state.",
      );
    return verified(
      () =>
        context.inspect()?.current?.id !== before ||
        elements('[role="alert"]').some((e) =>
          norm(label(e)).includes(norm(actionLabel)),
        ),
      "Gmail reports the requested archive or restore change. Verify the destination folder before live qualification.",
    );
  }
  if (id === "LI02")
    return await autocomplete(
      field(["City, state, or zip code", "Search location"], document),
      args.query,
      valid,
      context,
      request,
    );
  if (id === "LI03")
    return selectControl([
      (
        {
          "remote jobs": "Remote",
          "hybrid jobs": "Hybrid",
          "on site jobs": "On-site",
          "full time": "Full-time",
          "part time": "Part-time",
        } as Record<string, string>
      )[args.query || ""] || "",
    ]);
  if (id === "LI05") {
    if (args.mode === "return to results")
      return outcome("available", "Returning to job results.", {
        navigate: {
          url: "https://www.linkedin.com/jobs/search/",
          newTab: false,
        },
      });
    const details = one(".jobs-description__content,.jobs-box__html-content");
    return details && s.current
      ? outcome(
          "available",
          `${s.current.label}. ${(details.textContent || "").trim().slice(0, 1500)}`,
          { evidence: s.current.id },
        )
      : outcome(
          "unavailable",
          "Open a specific job with rendered details first.",
        );
  }
  if (id === "LI06") {
    if (!target || !visible(target))
      return outcome("unavailable", "The job Save control changed.");
    target.click();
    return verified(() => {
      const buttons = controls(["Save", "Saved", "Unsave"], scope);
      return (
        buttons.length === 1 &&
        stateOf(buttons[0], ["Saved", "Unsave"], ["Save"]) ===
          (args.mode !== "unsave")
      );
    }, "Verified the selected job's saved state.");
  }
  if (id === "LI07") {
    const link = one(
      ".job-details-jobs-unified-top-card__company-name a,.jobs-unified-top-card__company-name a",
    );
    if (!(link instanceof HTMLAnchorElement))
      return outcome(
        "unavailable",
        "The current job's company link is unavailable.",
      );
    const url = new URL(link.getAttribute("href")!, s.url);
    return url.hostname === new URL(s.url).hostname &&
      /^\/company\//.test(url.pathname)
      ? outcome("available", "Opening the job's company profile.", {
          navigate: { url: url.href, newTab: false },
        })
      : outcome("unavailable", "The company link leaves the supported domain.");
  }
  if (id === "IR01" || id === "IR02") {
    const input = id === "IR01" ? origin() : destination();
    if (request.entityId) {
      const option = context.node(request.entityId);
      if (
        !option ||
        !option.matches('[role="option"],.ui-autocomplete-list-item')
      )
        return outcome("unavailable", "The station choice expired.");
      option.click();
      return verified(
        () =>
          stationCode(input) !== undefined &&
          norm(value(input!)).includes(norm(label(option))),
        "Selected the exact station name and code.",
      );
    }
    return await autocomplete(input, args.query, valid, context, request);
  }
  if (id === "IR03") {
    const formatted = args.query ? dateValue(args.query, new Date()) : null,
      input = journeyDay();
    if (!formatted || !(input instanceof HTMLInputElement))
      return outcome(
        "unavailable",
        "Say a valid future date with day, month and year. The date field must be available.",
      );
    const formattedInput =
      input.type === "date"
        ? formatted.split("/").reverse().join("-")
        : formatted;
    setInput(input, formattedInput);
    return verified(
      () => input.value === formattedInput,
      "Set the full journey date.",
    );
  }
  if (id === "IR04") {
    const query = norm(args.query || ""),
      selects = elements("#journeyClass,#journeyQuota").filter(
        (e): e is HTMLSelectElement => e instanceof HTMLSelectElement,
      );
    const alias: Record<string, string> = {
      "ac three tier": "AC 3 Tier (3A)",
      "ac two tier": "AC 2 Tier (2A)",
      sleeper: "Sleeper (SL)",
      general: "GENERAL",
      tatkal: "TATKAL",
    };
    const expected = alias[query] || args.query || "";
    const options = selects.flatMap((select) =>
      [...select.options]
        .filter((o) => !o.disabled && norm(o.text) === norm(expected))
        .map((option) => ({ select, option })),
    );
    if (options.length === 1) {
      setInput(options[0].select, options[0].option.value);
      return verified(
        () => options[0].select.value === options[0].option.value,
        `Selected ${options[0].option.text}.`,
      );
    }
    const menus = elements("#journeyClass,#journeyQuota");
    if (menus.length !== 2)
      return outcome(
        "unavailable",
        "The journey class and quota controls are unavailable.",
      );
    const available = controls([expected]);
    if (available.length === 1)
      return await selectControl([expected], document);
    return outcome(
      "unavailable",
      "Open the class or quota menu, then choose an exact displayed option.",
    );
  }
  if (id === "IR05") {
    const summary = journeySummary();
    if (!summary || !target || !visible(target))
      return outcome("unavailable", "The journey fields changed.");
    const before = new Set(
      elements(
        "app-train-list [data-train-number],app-train-list .train-heading",
      ),
    );
    target.click();
    return verified(() => {
      const displayed = one("[data-journey-summary]");
      return (
        !!displayed &&
        [stationCode(origin()), stationCode(destination()), summary.date].every(
          (v) => !!v && norm(label(displayed)).includes(norm(v)),
        ) &&
        elements(
          "app-train-list [data-train-number],app-train-list .train-heading",
        ).some((e) => !before.has(e))
      );
    }, "Train results match the selected station codes and journey date. Booking remains excluded.");
  }
  if (id === "IR07") {
    const selected = request.entityId
      ? context.node(request.entityId)
      : s.selected
        ? context.node(s.selected.id)
        : s.current
          ? context.node(s.current.id)
          : undefined;
    const card = selected?.closest("[data-train-number],.train-list-container");
    const details = card
      ? elements("[data-availability],.availability,.fare", card)
      : [];
    return details.length
      ? outcome(
          "available",
          `Displayed at ${new Date().toISOString()}: ${details.map(label).join(". ")}. Availability and fares may change.`,
          { evidence: s.current?.id },
        )
      : outcome(
          "unavailable",
          "Select a specific train with displayed availability or fare first.",
        );
  }
  if (id === "IR08") {
    const from = origin(),
      to = destination();
    if (
      !(from instanceof HTMLInputElement) ||
      !(to instanceof HTMLInputElement) ||
      !stationCode(from) ||
      !stationCode(to)
    )
      return outcome("unavailable", "Set both exact stations before swapping.");
    const beforeFrom = from.value,
      beforeTo = to.value,
      buttons = controls(["Swap", "Swap stations"]);
    if (buttons.length !== 1)
      return outcome(
        "unavailable",
        "The semantic station-swap control is unavailable.",
      );
    buttons[0].click();
    return verified(
      () => from.value === beforeTo && to.value === beforeFrom,
      "Swapped and verified both stations.",
    );
  }
  if (id === "IR09") return selectControl(["Departure time"], document);
  if (id === "MAP03") {
    if (!s.current)
      return outcome("needs-choice", "Open an exact place first.");
    const nodes = elements(
      args.mode?.includes("hours")
        ? '[data-item-id="oh"],[aria-label^="Hours"]'
        : '[data-item-id="address"]',
    );
    return nodes.length === 1
      ? outcome("available", `${s.current.label}. ${label(nodes[0])}`, {
          evidence: s.current.id,
        })
      : outcome(
          "unavailable",
          "That place detail is unavailable or ambiguous.",
        );
  }
  if (id === "MAP04") {
    const url = new URL("https://www.google.com/maps/dir/");
    url.search = new URLSearchParams({
      api: "1",
      origin: args.query!,
      destination: args.mode!,
      travelmode: "driving",
    }).toString();
    return outcome(
      "available",
      "Opening directions for the confirmed endpoints. Verify resolved place identities and the displayed route before using it.",
      { navigate: { url: url.href, newTab: false } },
    );
  }
  if (id === "MAP05") {
    const names: Record<string, string[]> = {
      walking: ["Walking"],
      driving: ["Driving"],
      "public transit": ["Transit"],
      "public transport": ["Transit"],
      transit: ["Transit"],
      cycling: ["Cycling", "Bicycling"],
      bicycling: ["Cycling", "Bicycling"],
    };
    const inputs = elements(
      "#directions-searchbox-0 input,#directions-searchbox-1 input",
    );
    if (inputs.length !== 2 || inputs.some((e) => !value(e).trim()))
      return outcome("unavailable", "Resolve both route endpoints first.");
    const endpoints = inputs.map(value);
    const buttons = controls(names[args.mode || ""] || []);
    if (buttons.length !== 1)
      return outcome("unavailable", "That route mode is unavailable.");
    if (stateOf(buttons[0], []) === true)
      return outcome(
        "already-satisfied",
        "That route mode is already selected.",
      );
    const routes = elements("[data-trip-index],[data-route-index]").map(
        (e) => e.textContent,
      ),
      button = buttons[0];
    button.click();
    return verified(
      () =>
        stateOf(button, []) === true &&
        inputs.every((e, i) => value(e) === endpoints[i]) &&
        elements("[data-trip-index],[data-route-index]").some(
          (e) => !routes.includes(e.textContent),
        ),
      "Verified the route mode, endpoints and refreshed route summary.",
    );
  }
  if (id === "MAP07") {
    const buttons = controls([args.mode === "in" ? "Zoom in" : "Zoom out"]),
      map = one('[data-map-zoom],[aria-label="Map"]');
    if (buttons.length !== 1 || !map)
      return outcome(
        "unavailable",
        "The map's semantic zoom control or scale evidence is unavailable.",
      );
    const before =
      map.getAttribute("data-map-zoom") || map.getAttribute("aria-label");
    buttons[0].click();
    return verified(
      () =>
        (map.getAttribute("data-map-zoom") ||
          map.getAttribute("aria-label")) !== before,
      "Verified the map scale changed. Browser zoom is unchanged.",
    );
  }
  if (id === "MAP09") {
    if (!s.current || !args.query)
      return outcome(
        "needs-choice",
        "Open an exact place before searching nearby.",
      );
    const url = new URL("https://www.google.com/maps/search/");
    url.search = new URLSearchParams({
      api: "1",
      query: `${args.query} near ${s.current.label}`,
    }).toString();
    return outcome(
      "available",
      "Opening nearby place search. Check the results' location.",
      { navigate: { url: url.href, newTab: false } },
    );
  }
  if (id === "MAP10")
    return selectControl(
      [args.mode === "highways" ? "Avoid highways" : "Avoid tolls"],
      document,
    );
  return outcome(
    "not-implemented",
    "That workflow is outside this adapter's supported controls.",
  );
}

async function autocomplete(
  input: HTMLElement | undefined,
  query: string | undefined,
  valid: () => boolean,
  context: SiteContext,
  request: SiteRequest,
): Promise<SiteResult> {
  if (!(input instanceof HTMLInputElement) || !query)
    return outcome(
      "unavailable",
      "A unique search field and exact name are required.",
    );
  input.focus();
  setInput(input, query);
  const listId = input.getAttribute("aria-controls");
  const optionRoot = () =>
    listId
      ? document.getElementById(listId)
      : input.closest('p-autocomplete,[role="combobox"]') || document;
  await until(() => {
    const root = optionRoot();
    return (
      !!root &&
      elements('[role="option"],.ui-autocomplete-list-item', root).length > 0
    );
  }, valid);
  if (!valid()) return outcome("unavailable", "The request was cancelled.");
  const root = optionRoot(),
    options = root
      ? elements('[role="option"],.ui-autocomplete-list-item', root).filter(
          (e) => norm(label(e)).includes(norm(query)),
        )
      : [];
  if (options.length !== 1) {
    const snapshot = context.inspect();
    const choices = snapshot?.entities.filter((e) =>
      options.includes(context.node(e.id)!),
    );
    if (choices?.length)
      return outcome(
        "needs-choice",
        "Several exact suggestions match. Say choose a number, or cancel.",
        { choices },
      );
    return outcome(
      "unavailable",
      options.length
        ? "Several suggestions match. Say the full station name and code."
        : "No exact suggestion is available. Say a displayed name and code.",
    );
  }
  const chosen = label(options[0]);
  options[0].click();
  return (await until(() => norm(input.value).includes(norm(chosen)), valid))
    ? outcome("available", `Selected ${chosen}.`, {
        evidence: "selected-suggestion",
      })
    : outcome(
        "failed",
        "The suggestion did not commit a verifiable field value.",
      );
}
