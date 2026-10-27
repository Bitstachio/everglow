import type { EventResponseDto, InviteAccessLevel } from "@/lib/api/generated";

/** The two envelopes a host can send (05.1–05.2): one admits people who add photos, one people who only look. */
export type EnvelopeKind = "adds" | "view";

export const ENVELOPE_KINDS: EnvelopeKind[] = ["adds", "view"];

const ACCESS_LEVELS: Record<EnvelopeKind, InviteAccessLevel> = { adds: "PARTICIPANT", view: "VIEWER" };

export const envelopeAccessLevel = (kind: EnvelopeKind): InviteAccessLevel => ACCESS_LEVELS[kind];

/** The link an envelope carries. The API lists invites for hosts only, so anyone else gets none. */
export const envelopeUrl = (event: Pick<EventResponseDto, "invites">, kind: EnvelopeKind): string | null =>
  event.invites.find((invite) => invite.accessLevel === ACCESS_LEVELS[kind])?.invitationUrl ?? null;

/** "Sat 7 Nov, 7 pm", or "Sat 7 Nov, 7:30 pm": when the roll is, as filled in on the envelope. */
export const formatEnvelopeDate = (iso: string): string => {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const hour = hours % 12 || 12;
  const time = minutes ? `${hour}:${String(minutes).padStart(2, "0")}` : String(hour);
  return `${day}, ${time} ${hours < 12 ? "am" : "pm"}`;
};
