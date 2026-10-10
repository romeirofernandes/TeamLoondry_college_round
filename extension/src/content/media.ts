import type { Intent } from "../shared";

/** Self-contained so Chrome can run this inside an isolated world in any frame. */
export async function mediaControl(intent: Intent | null): Promise<{ found: boolean; score: number; ok?: boolean; error?: string }> {
  const media: HTMLMediaElement[] = [];
  function scan(root: Document | ShadowRoot) {
    for (const element of root.querySelectorAll("video,audio")) {
      if (!(element instanceof HTMLMediaElement) || element.closest("[hidden],[inert],[data-handsfree-ignore]")) continue;
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (element instanceof HTMLVideoElement && (box.width <= 0 || box.height <= 0)) continue;
      media.push(element);
    }
    for (const element of root.querySelectorAll("*")) if (element.shadowRoot) scan(element.shadowRoot);
  }
  scan(document);
  const score = (element: HTMLMediaElement) => {
    const box = element.getBoundingClientRect();
    const width = Math.max(0, Math.min(innerWidth, box.right) - Math.max(0, box.left));
    const height = Math.max(0, Math.min(innerHeight, box.bottom) - Math.max(0, box.top));
    return element instanceof HTMLVideoElement ? width * height : element.paused ? 1 : 2;
  };
  media.sort((a, b) => score(b) - score(a));
  const selected = media[0];
  if (!selected) return { found: false, score: 0, error: "No video or audio player found. Open the player and enable webpage access." };
  const result = { found: true, score: score(selected) };
  if (!intent) return result;
  try {
    if (intent.type === "media-pause") selected.pause();
    else if (intent.type === "media-play") await selected.play();
    else if (intent.type === "media-toggle") selected.paused ? await selected.play() : selected.pause();
    else if (intent.type === "media-seek") {
      const finite = Number.isFinite(selected.duration);
      const lower = finite ? 0 : selected.seekable.length ? selected.seekable.start(0) : 0;
      const upper = finite ? selected.duration : selected.seekable.length ? selected.seekable.end(selected.seekable.length - 1) : selected.duration;
      if (!Number.isFinite(upper)) return { ...result, ok: false, error: "This live stream cannot seek yet." };
      selected.currentTime = Math.max(lower, Math.min(upper, selected.currentTime + intent.seconds));
    } else return { ...result, ok: false };
    return { ...result, ok: true };
  } catch {
    return { ...result, ok: false, error: "The player blocked this action. Start playback once on the page, then retry." };
  }
}
