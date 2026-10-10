import { wikipedia } from "./wikipedia";
import { github } from "./github";
import { reddit } from "./reddit";
import { amazon } from "./amazon";
import { spotify } from "./spotify";
import { netflix } from "./netflix";
import { x } from "./x";
import type { Adapter, SiteId } from "./types";
export const adapters: Record<SiteId, Adapter> = {
  wikipedia,
  github,
  reddit,
  amazon,
  spotify,
  netflix,
  x,
};
