import { normalizeSpeech } from "../core/parser";
import { adapters } from "./registry";
import { catalogue, siteForUrl } from "./catalogue";
import type { Intent } from "../shared";
import type { SiteArgs, SiteRequest, SiteSnapshot, ActionSpec } from "./types";
const small: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
};
export function numberSlot(value: string): number | null {
  const text = normalizeSpeech(value).replace(/-/g, " ");
  if (/^\d{1,7}(?:\.\d{1,2})?$/.test(text)) return Number(text);
  const decimal = /^(.+) point (zero|one|two|three|four|five|six|seven|eight|nine)$/.exec(text);
  if (decimal) {
    const whole = numberSlot(decimal[1]);
    const fraction = small[decimal[2]];
    return whole === null ? null : whole + fraction / 10;
  }
  let total = 0,
    part = 0;
  for (const word of text.split(" ")) {
    if (word === "and") continue;
    if (Object.hasOwn(small, word)) part += small[word];
    else if (word === "hundred" && part) part *= 100;
    else if (word === "thousand" && part) {
      total += part * 1000;
      part = 0;
    } else return null;
  }
  return total + part;
}
export function timeSlot(value: string): number | null {
  let text = normalizeSpeech(value);
  if (text === "half a minute") return 30;
  const colon = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (colon) {
    const parts = colon.slice(1).filter(Boolean).map(Number);
    if (parts.slice(1).some((n) => n >= 60)) return null;
    return parts.reduce((sum, n) => sum * 60 + n, 0);
  }
  const minutes = /^(.+?) minutes?(?: (.+?)(?: seconds?)?)?$/.exec(text);
  if (minutes) {
    const m = numberSlot(minutes[1]),
      s = minutes[2] ? numberSlot(minutes[2]) : 0;
    return m !== null && s !== null && s < 60 ? m * 60 + s : null;
  }
  text = text.replace(/ seconds?$/, "");
  return numberSlot(text);
}
export function isCancellation(text: string) {
  return /^(?:cancel(?: that request| the search| it)?|never mind|nevermind|don't do that|do not do that|leave it as it is|stop that action|no|isko mat bhejo)$/.test(
    normalizeSpeech(text),
  );
}
export function unsafeSpeech(text: string): boolean {
  const n = normalizeSpeech(text).replace(/[’‘]/g, "'");
  return (
    /\b(?:do not|don't|dont|never|not|mat)\b/.test(n) ||
    /^(?:how (?:do|can)|what (?:is|does)|i (?:like|love|enjoy)\b|write\s+["']|say\s+["'])/.test(
      n,
    ) ||
    /\b(?:buy now|checkout|place (?:the |my )?order|purchase|merge|delete (?:my )?(?:account|repository)|pay|subscribe)\b/.test(
      n,
    )
  );
}
export function makeRequest(
  snapshot: SiteSnapshot,
  id: SiteRequest["action"],
  args: SiteArgs = {},
): SiteRequest {
  const spec = adapters[snapshot.site].actions.find((a) => a.id === id);
  const bound = spec?.write && spec.operation.kind !== "prompt"
    ? snapshot.selected || snapshot.current
    : null;
  return {
    type: "site-action",
    site: snapshot.site,
    url: snapshot.url,
    action: id,
    args,
    revision: snapshot.revision,
    documentId: snapshot.documentId,
    requestId: crypto.randomUUID(),
    ...(bound ? { entityId: bound.id } : {}),
  };
}
function argsFor(
  spec: ActionSpec,
  match: RegExpExecArray,
  text: string,
): SiteArgs | null {
  const args: SiteArgs = {};
  if(spec.id === "CH07" && text === "list conversations") return {mode:"list"};
  if (spec.id === "W08" && /^(?:find|select)/.test(text)) args.mode = "select";
  if (spec.extract === "query") {
    if (spec.id === "MAP04") {
      if (text === "review directions") return {mode:"review"};
      if (!match[1]?.trim() || !match[2]?.trim() || match[1].length > 300 || match[2].length > 100) return null;
      return {query:match[1].trim(),mode:match[2].trim()};
    }
    args.query = match
      .slice(1)
      .filter(Boolean)
      .join(" by ")
      .replace(/ slash /g, "/")
      .replace(/ dot /g, ".")
      .trim();
    if (!args.query || args.query.length > 300) return null;
    if (spec.id === "G02")
      args.query =
        (
          {
            "repository results": "Repositories",
            repositories: "Repositories",
            issues: "Issues",
            code: "Code",
            users: "Users",
          } as Record<string, string>
        )[args.query] || args.query;
    if (spec.id === "G11" && ["open", "closed"].includes(args.query))
      args.query = `is:issue is:${args.query}`;
  }
  if (spec.extract === "mode") args.mode = match.slice(1).find(Boolean) || text;
  if (spec.extract === "ordinal") {
    const ordinal = match.slice(1).find(Boolean) || "";
    const n = numberSlot(ordinal.replace(/^number /, ""));
    if (n === null || n < 1 || n > 100) return null;
    args.index = n;
    if (/\b(?:in )?(?:a )?new tab\b/.test(text)) args.mode = "new-tab";
  }
  if (spec.extract === "number") {
    const segments = match
      .slice(1)
      .filter(Boolean)
      .filter((s) => !["forward", "back", "rewind"].includes(s));
    const media = spec.operation.kind === "media";
    const n = segments.length
      ? media
        ? timeSlot(segments[0])
        : numberSlot(segments[0])
      : spec.operation.kind === "media" &&
          spec.operation.command === "volume-relative"
        ? 10
        : null;
    if (n === null && ["R09","R20"].includes(spec.id) && !segments.length) return args;
    if (n === null || !Number.isFinite(n) || n < 0 || n > 1000000) return null;
    args.value = n;
    if (segments[1]) {
      const end = numberSlot(segments[1]);
      if (end === null || end < n) return null;
      args.end = end;
    }
    if (
      spec.operation.kind === "media" &&
      spec.operation.command === "seek" &&
      n > 600
    )
      return null;
    if (
      spec.operation.kind === "media" &&
      spec.operation.command.startsWith("volume") &&
      n > 100
    )
      return null;
    if (media && /\b(?:back|rewind|lower)\b/.test(text)) args.value = -n;
    if (spec.operation.kind === "reference" && (n < 1 || n > 10000))
      return null;
  }
  return args;
}
export function parseSite(
  text: string,
  snapshot: SiteSnapshot,
): SiteRequest | null {
  const normalized = normalizeSpeech(text)
    .replace(/^(?:(?:could|can|would) you )?(?:please )?/, "")
    .replace(/ please$/, "")
    .replace(/[.!?,;:]+$/, "")
    .replace(/^actually[, ]+/, "");
  const explicitChatGPTPrompt =
    snapshot.site === "chatgpt" &&
    /^(?:(?:word|would) )?(?:i want to )?ask (?:(?:chat ?gpt)|(?:the )?ai|this assistant) .+/.test(normalized);
  if ((unsafeSpeech(normalized) && !explicitChatGPTPrompt) || isCancellation(normalized)) return null;
  // Broad named-entity patterns are considered after specific commands.
  const ordered = [...adapters[snapshot.site].actions].sort(
    (a, b) =>
      Number(["G03", "A02", "S03", "W04", "A08", "G01", "R01", "WA01", "GM01", "LI01", "MAP01"].includes(a.id)) -
      Number(["G03", "A02", "S03", "W04", "A08", "G01", "R01", "WA01", "GM01", "LI01", "MAP01"].includes(b.id)),
  );
  for (const spec of ordered) {
    const match = spec.pattern.exec(normalized);
    if (!match) continue;
    const args = argsFor(spec, match, normalized);
    if (args) return makeRequest(snapshot, spec.id, args);
  }
  return null;
}
/** Jev sees only app-created objects. It chooses keys; it cannot invent arguments. */
export function siteCandidates(
  text: string,
  snapshot: SiteSnapshot,
): Record<string, { intent: Intent; description: string }> {
  const candidates: Record<string, { intent: Intent; description: string }> =
    {};
  if (unsafeSpeech(text) || isCancellation(text)) return candidates;
  const parsed = parseSite(text, snapshot);
  for (const spec of adapters[snapshot.site].actions) {
    if (spec.operation.kind === "unsupported" || snapshot.capabilities.find(c=>c.id===spec.id)?.state === "not-implemented") continue;
    const matched = parsed?.action === spec.id;
    if (spec.extract && !matched) {
      if (spec.operation.kind !== "entities") continue;
      const kind = spec.operation.entity;
      const matching = snapshot.entities.filter(
        (e) =>
          e.kind === kind &&
          e.label &&
          normalizeSpeech(text).includes(normalizeSpeech(e.label)),
      );
      if (matching.length !== 1) continue;
      candidates[`${snapshot.site}.${spec.id}`] = {
        intent: makeRequest(snapshot, spec.id, { query: matching[0].label }),
        description:
          catalogue.find((a) => a.id === spec.id)!.description +
          ". Grounded visible item: " +
          matching[0].label,
      };
      continue;
    }
    const intent = matched ? parsed! : makeRequest(snapshot, spec.id);
    candidates[`${snapshot.site}.${spec.id}`] = {
      intent,
      description:
        catalogue.find((a) => a.id === spec.id)!.description +
        ". Voice examples: " + catalogue.find(a=>a.id===spec.id)!.examples.join("; ") + ". " +
        (spec.operation.kind === "media" && spec.operation.command === "pause" ? "Hold or temporarily stop the current music, tune, song, video or episode. " : "") +
        (spec.write && spec.operation.kind !== "prompt"
          ? "Account change: explicit confirmation is mandatory."
          : ""),
    };
  }
  return candidates;
}
export function validateSiteRequest(value: unknown): SiteRequest | null {
  if (!value || typeof value !== "object") return null;
  const v = value as SiteRequest;
  if (
    v.type !== "site-action" ||
    !Object.hasOwn(adapters, v.site) ||
    !adapters[v.site].actions.some((a) => a.id === v.action) ||
    (v.url !== undefined &&
      (typeof v.url !== "string" || v.url.length > 3000 || siteForUrl(v.url) !== v.site)) ||
    typeof v.documentId !== "string" ||
    v.documentId.length > 100 ||
    typeof v.requestId !== "string" ||
    v.requestId.length > 100 ||
    !Number.isSafeInteger(v.revision) ||
    v.revision < 0 ||
    !v.args ||
    typeof v.args !== "object"
  )
    return null;
  const { query, value: n, end, index, mode } = v.args;
  if (
    (query !== undefined &&
      (typeof query !== "string" || !query.trim() || query.length > 300)) ||
    (mode !== undefined && (typeof mode !== "string" || mode.length > 100)) ||
    [n, end, index].some(
      (x) =>
        x !== undefined &&
        (typeof x !== "number" || !Number.isFinite(x) || Math.abs(x) > 1000000),
    ) ||
    (index !== undefined &&
      (!Number.isInteger(index) || index < 1 || index > 100))
  )
    return null;
  return {
    type: "site-action",
    site: v.site,
    ...(typeof v.url === "string" ? { url: v.url } : {}),
    action: v.action,
    args: { query, value: n, end, index, mode },
    revision: v.revision,
    documentId: v.documentId,
    requestId: v.requestId,
    ...(typeof v.entityId === "string" && v.entityId.length <= 100
      ? { entityId: v.entityId }
      : {}),
  };
}
