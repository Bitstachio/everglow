/**
 * Reading invites (chapter 06). Pure helpers, shared by the scanner, the
 * paste slip and the envelope.
 */

/**
 * The invite token in whatever was scanned or pasted: a bare token, or the
 * last path segment of a link on any domain. The same rule as the API's
 * `extractInvitationToken` (api/src/events/events.invitation.ts), so a link
 * the app accepts is one join accepts.
 */
export const extractInvitationToken = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed.includes("/")) return trimmed;
  // React Native's URL only parses http(s) paths, so the query and fragment
  // are cut by hand; this also covers the app's own scheme and bare hosts.
  const path = trimmed.replace(/[?#].*$/, "");
  return path.split("/").filter(Boolean).at(-1) ?? trimmed;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether clipboard text is worth offering as an invite (06.2): one link, or a
 * bare token as the API mints them. Anything else stays off the field.
 */
export const looksLikeInvite = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 255 || /\s/.test(trimmed)) return false;
  return UUID.test(trimmed) || (trimmed.includes("/") && extractInvitationToken(trimmed).length > 0);
};

/** "4 pm", "7:30 pm". */
const formatHour = (date: Date): string => {
  const hour = date.getHours() % 12 || 12;
  const minutes = date.getMinutes();
  const suffix = date.getHours() < 12 ? "am" : "pm";
  return minutes ? `${hour}:${String(minutes).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
};

/** "Sun 18 Oct, 4 pm": when a roll happens, as the envelope prints it. */
export const formatEnvelopeDate = (iso: string): string => {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return `${day}, ${formatHour(date)}`;
};

/** "17 Nov": the day a roll's photos go. */
export const formatPickUpDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** "Sam" from "Sam Rivera": the envelope names the host the way friends would. */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;
