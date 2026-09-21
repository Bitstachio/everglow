import { AccessLevel, Prisma } from "generated/prisma/client";
import { blockByCallerArgs } from "src/moderation/moderation.types";
import { userWithDetailsInclude } from "src/users/users.types";

export const eventWithCallerAccessInclude = (userId: string) =>
  ({
    eventAccesses: { where: { userId } },
  }) as const;

export type EventWithCallerAccessInclude = ReturnType<typeof eventWithCallerAccessInclude>;

export type EventParticipant = {
  userId: string;
  name: string;
  accessLevel: AccessLevel;
  /** Whether the caller has blocked this member. Never the reverse (docs/moderation.md). */
  isBlockedByCaller: boolean;
};

/** A membership with its user's profile and, in the same query, the caller's block on that user if any. */
export const eventAccessWithUserInclude = (callerId: string) =>
  ({
    user: { include: { ...userWithDetailsInclude, blocksReceived: blockByCallerArgs(callerId) } },
  }) as const;

export type EventAccessWithUser = Prisma.EventAccessGetPayload<{
  include: ReturnType<typeof eventAccessWithUserInclude>;
}>;
