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

// Some ICU versions shorten September to "Sept"; the lab writes three letters.
const shortMonth = (date: Date): string => date.toLocaleDateString("en-GB", { month: "short" }).slice(0, 3);

/** "21 Sep": a day on the envelope, such as when the photos go. */
export const formatEnvelopeDay = (iso: string): string => {
  const date = new Date(iso);
  return `${date.getDate()} ${shortMonth(date)}`;
};

/** "Sat 7 Nov, 7 pm", or "Sat 7 Nov, 7:30 pm": when the roll is, as filled in on the envelope. */
export const formatEnvelopeDate = (iso: string): string => {
  const date = new Date(iso);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 3);
  const day = `${weekday} ${formatEnvelopeDay(iso)}`;
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const hour = hours % 12 || 12;
  const time = minutes ? `${hour}:${String(minutes).padStart(2, "0")}` : String(hour);
  return `${day}, ${time} ${hours < 12 ? "am" : "pm"}`;
};
