declare const __HANDS_FREE_PROVIDERS__: { groqKeys: string[]; jevKey: string; jevKeys?: string[] } | undefined;
/** Only the extension service worker imports this build-time configuration. */
export const bundledProviders = typeof __HANDS_FREE_PROVIDERS__ !== "undefined"
  ? __HANDS_FREE_PROVIDERS__
  : { groqKeys: [], jevKey: "", jevKeys: [] };
