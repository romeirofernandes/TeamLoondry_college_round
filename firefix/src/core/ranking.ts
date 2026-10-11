import type { TargetText } from "../shared";

export interface MatchScore {
  id: string;
  score: number;
}
export interface MatchResult {
  kind: "match" | "tie" | "none";
  ids: string[];
  scores: MatchScore[];
}
export interface TabSummary {
  id?: number;
  title?: string;
  index?: number;
  windowId?: number;
}

function words(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

const queryFiller = new Set(["the", "a", "an", "page", "website", "site"]);
function equivalent(a: string, b: string): boolean {
  return (
    a === b ||
    (a.length >= 4 && b.length >= 4 && (a + "s" === b || b + "s" === a))
  );
}

/** Conservative local ranking. A partial multiword overlap never selects a target. */
export function rankTargets(query: string, targets: TargetText[]): MatchResult {
  const queryWords = words(query).filter((word) => !queryFiller.has(word));
  if (queryWords.length === 0) return { kind: "none", ids: [], scores: [] };
  const normalizedQuery = queryWords.join(" ");
  const scores: MatchScore[] = [];
  const seen = new Set<string>();
  for (const target of targets) {
    if (!target.id || seen.has(target.id)) continue;
    seen.add(target.id);
    const targetWords = words(target.text);
    if (
      !queryWords.every((word) =>
        targetWords.some((candidate) => equivalent(word, candidate)),
      )
    )
      continue;
    const normalizedTarget = targetWords.join(" ");
    const score =
      normalizedTarget === normalizedQuery
        ? 100
        : ` ${normalizedTarget} `.includes(` ${normalizedQuery} `)
          ? 90
          : Math.max(
              70,
              85 - Math.max(0, targetWords.length - queryWords.length),
            );
    scores.push({ id: target.id, score });
  }
  scores.sort((a, b) => b.score - a.score);
  if (scores.length === 0) return { kind: "none", ids: [], scores };
  const ids = scores
    .filter((score) => scores[0].score - score.score <= 5)
    .map((score) => score.id);
  return { kind: ids.length === 1 ? "match" : "tie", ids, scores };
}

export function rankTabs(query: string, tabs: TabSummary[]): MatchResult {
  return rankTargets(
    query,
    tabs
      .filter((tab) => tab.id !== undefined)
      .map((tab) => ({
        id: String(tab.id),
        text: tab.title ?? "",
        role: "tab",
      })),
  );
}

/** Wrap within the active tab's window. IDs are never inferred from array position. */
export function adjacentTabId(
  tabs: TabSummary[],
  currentId: number,
  direction: "next" | "previous",
): number | null {
  const current = tabs.find((tab) => tab.id === currentId);
  if (!current) return null;
  const ordered = tabs
    .filter((tab) => tab.id !== undefined && tab.windowId === current.windowId)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const index = ordered.findIndex((tab) => tab.id === currentId);
  if (index < 0 || !ordered.length) return null;
  return (
    ordered[
      (index + (direction === "next" ? 1 : -1) + ordered.length) %
        ordered.length
    ].id ?? null
  );
}
