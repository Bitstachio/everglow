import { AccessLevel, Event, Prisma } from "generated/prisma/client";
import { blockByCallerArgs } from "src/moderation/moderation.types";
import { userWithDetailsInclude } from "src/users/users.types";
import type { InvitePreviewState } from "./events.constants";
import type { EventInviteAccessLevel } from "./events.invitation";

export const eventWithCallerAccessInclude = (userId: string) =>
  ({
    eventAccesses: { where: { userId } },
  }) as const;

export type EventWithCallerAccessInclude = ReturnType<typeof eventWithCallerAccessInclude>;

export type EventParticipant = {
  userId: string;
  username: string;
  name: string;
  accessLevel: AccessLevel;
  /** Short-lived presigned URL of the member's avatar; null when they have none. */
  avatarUrl: string | null;
  /** Whether the caller has blocked this member. Never the reverse (docs/moderation.md). */
  isBlockedByCaller: boolean;
  /** Photos this member added that the caller can see (PhotoVisibilityService.countVisibleByUploader). */
  photoCount: number;
};

/** A membership with its user's profile and, in the same query, the caller's block on that user if any. */
export const eventAccessWithUserInclude = (callerId: string) =>
  ({
    user: { include: { ...userWithDetailsInclude, blocksReceived: blockByCallerArgs(callerId) } },
  }) as const;

export type EventAccessWithUser = Prisma.EventAccessGetPayload<{
  include: ReturnType<typeof eventAccessWithUserInclude>;
}>;

export const eventBanWithUserInclude = { user: { include: userWithDetailsInclude } } as const;

export type EventBanWithUser = Prisma.EventBanGetPayload<{ include: typeof eventBanWithUserInclude }>;

/** An organizer, as an invite names them: who hosts the event. */
export type InviteHost = {
  userId: string;
  /** Null once their profile is gone. */
  name: string | null;
};

/** What an invite leads to, for someone deciding whether to join. No images: only members see those. */
export type InvitePreview = {
  state: InvitePreviewState;
  event: Event;
  /** The invite's token, which the shareable link is built from. */
  token: string;
  accessLevel: EventInviteAccessLevel;
  memberCount: number;
  memberLimit: number | null;
  /** The organizer the caller blocked when that is what stops them; otherwise the creator, or the longest-standing organizer. */
  host: InviteHost | null;
};
