export interface ReadingPreferences {
  scale: number;
  rate: number;
  fontSize: number;
  hover: boolean;
  follow: boolean;
  relaxed: boolean;
  theme: "light" | "paper" | "dark";
  voice: string;
}
export const readingDefaults: ReadingPreferences = {
  scale: 2,
  rate: 0.95,
  fontSize: 24,
  hover: true,
  follow: false,
  relaxed: false,
  theme: "paper",
  voice: "",
};
export function readingPreferences(value: unknown): ReadingPreferences {
  const p =
    value && typeof value === "object"
      ? (value as Partial<ReadingPreferences>)
      : {};
  const bounded = (n: unknown, min: number, max: number, fallback: number) =>
    typeof n === "number" && Number.isFinite(n)
      ? Math.max(min, Math.min(max, n))
      : fallback;
  return {
    scale: bounded(p.scale, 1.5, 3, 2),
    rate: bounded(p.rate, 0.5, 2, 0.95),
    fontSize: bounded(p.fontSize, 18, 40, 24),
    hover: typeof p.hover === "boolean" ? p.hover : true,
    follow: p.follow === true,
    relaxed: p.relaxed === true,
    theme: p.theme === "dark" || p.theme === "light" ? p.theme : "paper",
    voice: typeof p.voice === "string" ? p.voice.slice(0, 200) : "",
  };
}
export function readingSentences(
  text: string,
): { text: string; start: number; end: number }[] {
  return [
    ...new Intl.Segmenter("en", { granularity: "sentence" }).segment(text),
  ]
    .filter((s) => s.segment.trim())
    .map((s) => ({
      text: s.segment,
      start: s.index,
      end: s.index + s.segment.trimEnd().length,
    }));
}
