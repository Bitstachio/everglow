import { AccessLevel } from "generated/prisma/client";

export const EVENT_INVITATION_BASE_URL = process.env.EVENT_INVITATION_BASE_URL ?? "https://events.everglow.app/invite";

/**
 * Roles that get a join link on every event. Never ORGANIZER: a link can be
 * forwarded, and an organizer can remove people and delete the event. Someone
 * becomes an organizer only when an organizer promotes a member.
 */
export const INVITE_ACCESS_LEVELS = {
  PARTICIPANT: AccessLevel.PARTICIPANT,
  VIEWER: AccessLevel.VIEWER,
} as const;

export const EVENT_INVITE_ACCESS_LEVELS = Object.values(INVITE_ACCESS_LEVELS);

export type EventInviteAccessLevel = (typeof INVITE_ACCESS_LEVELS)[keyof typeof INVITE_ACCESS_LEVELS];

export const isInviteAccessLevel = (accessLevel: AccessLevel): accessLevel is EventInviteAccessLevel =>
  (EVENT_INVITE_ACCESS_LEVELS as AccessLevel[]).includes(accessLevel);

export const buildInvitationUrl = (token: string): string => `${EVENT_INVITATION_BASE_URL}/${token}`;

export const extractInvitationToken = (input: string): string => {
  const trimmed = input.trim();

  if (!trimmed.includes("/")) {
    return trimmed;
  }

  try {
    const segment = new URL(trimmed).pathname.split("/").filter(Boolean).at(-1);
    return segment ?? trimmed;
  } catch {
    return trimmed.split("/").filter(Boolean).at(-1) ?? trimmed;
  }
};
