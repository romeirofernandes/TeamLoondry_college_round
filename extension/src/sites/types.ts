import type { ActionId, SiteId } from "./catalogue";
export type { ActionId, SiteId } from "./catalogue";
export type SupportState =
  | "available"
  | "needs-choice"
  | "needs-confirmation"
  | "unavailable"
  | "not-implemented"
  | "failed"
  | "already-satisfied";
export type EntityKind =
  | "article"
  | "section"
  | "link"
  | "reference"
  | "repository"
  | "folder"
  | "file"
  | "issue"
  | "pull-request"
  | "post"
  | "comment"
  | "community"
  | "product"
  | "track"
  | "album"
  | "playlist"
  | "artist"
  | "profile"
  | "title"
  | "episode"
  | "chat"
  | "message"
  | "thread"
  | "draft"
  | "meeting"
  | "job"
  | "train"
  | "place"
  | "route"
  | "station";
export interface Entity {
  id: string;
  kind: EntityKind;
  label: string;
  detail: string;
  identity?: string;
  href?: string;
}
export interface SiteSnapshot {
  site: SiteId;
  revision: number;
  documentId: string;
  url: string;
  pageType: string;
  meetingActive?: boolean;
  entities: Entity[];
  current: Entity | null;
  selected?: Entity;
  capabilities: { id: ActionId; state: SupportState; description: string }[];
}
export interface SiteArgs {
  query?: string;
  value?: number;
  end?: number;
  index?: number;
  mode?: string;
}
export interface SiteRequest {
  type: "site-action";
  site: SiteId;
  action: ActionId;
  args: SiteArgs;
  revision: number;
  documentId: string;
  requestId: string;
  entityId?: string;
}
export interface SiteResult {
  state: SupportState;
  feedback: string;
  evidence?: string;
  choices?: Entity[];
  focusField?: boolean;
  navigate?: { url: string; newTab: boolean };
}
export type Operation =
  | { kind: "group-b"; scope?: string }
  | { kind: "search"; url: string }
  | { kind: "entities"; entity: EntityKind; selectOnly?: boolean }
  | {
      kind:
        | "sections"
        | "introduction"
        | "section-next"
        | "section-previous"
        | "reference-return"
        | "find-next"
        | "find-previous"
        | "info"
        | "back";
    }
  | { kind: "find" | "section" | "reference" }
  | { kind: "route"; path: string }
  | {
      kind: "control";
      names: string[];
      scope?: string;
      verify:
        | "selected"
        | "expanded"
        | "closed"
        | "entity-change"
        | "destination";
    }
  | {
      kind: "state";
      names: string[];
      opposite: string[];
      desired: boolean;
      scope?: string;
    }
  | { kind: "select"; selector: string }
  | { kind: "price"; lower?: string; upper: string; submit: string }
  | {
      kind: "media";
      command:
        | "play"
        | "pause"
        | "next"
        | "previous"
        | "restart"
        | "seek"
        | "seek-absolute"
        | "mute"
        | "volume"
        | "volume-relative";
    }
  | { kind: "field"; names: string[]; scope?: string }
  | { kind: "submit"; names: string[]; scope: string; created: string }
  | { kind: "clear-draft"; scope: string }
  | { kind: "unsupported"; reason: string };
export interface ActionSpec {
  id: ActionId;
  pattern: RegExp;
  operation: Operation;
  write?: boolean;
  guardNames?: string[];
  extract?: "query" | "number" | "ordinal" | "mode";
}
export interface Adapter {
  site: SiteId;
  entities: Partial<Record<EntityKind, string>>;
  current: string;
  currentKind?: EntityKind;
  scope: string;
  actions: ActionSpec[];
}
