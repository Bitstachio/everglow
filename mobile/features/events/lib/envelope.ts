import type { EventResponseDto, InviteAccessLevel } from "@/lib/api/generated";

/** The two envelopes a host can send (05.1–05.2): one admits people who add photos, one people who only look. */
export type EnvelopeKind = "adds" | "view";

export const ENVELOPE_KINDS: EnvelopeKind[] = ["adds", "view"];

const ACCESS_LEVELS: Record<EnvelopeKind, InviteAccessLevel> = { adds: "PARTICIPANT", view: "VIEWER" };

export const envelopeAccessLevel = (kind: EnvelopeKind): InviteAccessLevel => ACCESS_LEVELS[kind];

/**
 * Whether the envelope still admits anyone. A closed roll can't be joined
 * (05.6); one under review is on hold until Everglow decides (05.7); a
 * suspended one stays shut. The API refuses joins in all three.
 */
export type EnvelopeState = "open" | "closed" | "onHold" | "suspended";

export const envelopeState = (event: Pick<EventResponseDto, "galleryState" | "status">): EnvelopeState => {
  if (event.galleryState === "CLOSED") return "closed";
  if (event.status === "SUSPENDED") return "suspended";
  if (event.status === "UNDER_REVIEW") return "onHold";
  return "open";
};

/** When a closed roll's photos went: cut short by a host, or at the end of its window. */
export const closedOn = (event: Pick<EventResponseDto, "deactivatedAt" | "galleryClosesAt" | "updatedAt">): string =>
  event.deactivatedAt ?? event.galleryClosesAt ?? event.updatedAt;

/** The link an envelope carries. The API lists invites for hosts only, so anyone else gets none. */
export const envelopeUrl = (event: Pick<EventResponseDto, "invites">, kind: EnvelopeKind): string | null =>
  event.invites.find((invite) => invite.accessLevel === ACCESS_LEVELS[kind])?.invitationUrl ?? null;

/** How many envelopes the host holds: one per kind the API listed an invite for. A closed roll has none. */
export const envelopeCount = (event: Pick<EventResponseDto, "invites">): number =>
  ENVELOPE_KINDS.filter((kind) => envelopeUrl(event, kind) !== null).length;
