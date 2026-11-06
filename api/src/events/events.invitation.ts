import { NotFoundException } from "@nestjs/common";
import { AccessLevel } from "generated/prisma/client";
import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";
import { inviteTokenHash } from "src/common/logging/redact-url";

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

/**
 * The one 404 for an invite that can't be used, whatever the reason. Its
 * message is the request's logged `errorReason`, so it names the token's hash
 * (`inviteTokenHash`), never the token.
 */
export const inviteNotFound = (token: string): NotFoundException =>
  new NotFoundException(
    RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "invitation token hash", inviteTokenHash(token)),
  );

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
