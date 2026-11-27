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

/** An invite link's path, on any host or the app's own scheme: `/join/<token>` or `/invite/<token>`. */
const INVITE_PATH = /^(?:[a-z][a-z\d+.-]*:\/\/[^/]*)?\/*(?:join|invite)\/([^/?#]+)\/?(?:[?#].*)?$/i;

/**
 * Where a link that opened the app should land: the envelope for an invite
 * link (`everglowmobile://join/k8Qm2`, `…/invite/k8Qm2`, or a web link once
 * EV-140 routes one here), unchanged for anything else.
 */
export const routeForIncomingLink = (path: string): string => {
  const token = INVITE_PATH.exec(path.trim())?.[1];
  return token ? `/join/${token}` : path;
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

/** "Sam" from "Sam Rivera": the envelope names the organizer the way friends would. */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;
