import { whatsapp } from "./whatsapp";
import { gmail } from "./gmail";
import { meet } from "./meet";
import { linkedin } from "./linkedin";
import { irctc } from "./irctc";
import { maps } from "./maps";
import { wikipedia } from "./wikipedia";
import { github } from "./github";
import { reddit } from "./reddit";
import { amazon } from "./amazon";
import { spotify } from "./spotify";
import { netflix } from "./netflix";
import { x } from "./x";
import { youtube } from "./youtube";
import { chatgpt } from "./chatgpt";
import type { Adapter, SiteId } from "./types";
export const adapters: Record<SiteId, Adapter> = {
  whatsapp, gmail, meet, linkedin, irctc, maps,
  wikipedia,
  github,
  reddit,
  amazon,
  spotify,
  netflix,
  youtube,
  chatgpt,
  x,
};
