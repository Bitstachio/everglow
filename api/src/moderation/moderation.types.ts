import { Prisma } from "generated/prisma/client";
import { userWithDetailsInclude } from "src/users/users.types";

/**
 * What `PhotoVisibilityService` needs to know about a photo's event: the
 * caller's membership (organizers are exempt from every filter). Load the
 * event with this include and it arrives with the row, so visibility costs no
 * extra event query.
 */
export const eventForPhotoVisibilityInclude = (callerId: string) =>
  ({
    eventAccesses: { where: { userId: callerId } },
  }) as const;

export type EventForPhotoVisibility = Prisma.EventGetPayload<{
  include: ReturnType<typeof eventForPhotoVisibilityInclude>;
}>;

/**
 * Relation filter for `User.blocksReceived`: the block the caller holds against
 * that user, if any. One direction only, on purpose: it must never reveal who
 * has blocked the caller.
 */
export const blockByCallerArgs = (callerId: string) =>
  ({
    where: { blockerId: callerId },
    select: { id: true },
  }) as const;

export const blockWithBlockedUserInclude = {
  blocked: { include: userWithDetailsInclude },
} as const;

export type BlockWithBlockedUser = Prisma.UserBlockGetPayload<{
  include: typeof blockWithBlockedUserInclude;
}>;
