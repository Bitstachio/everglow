import { AccessLevel } from "generated/prisma/client";
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
  /** Short-lived presigned URL of the member's avatar; null when they have none. */
  avatarUrl: string | null;
};

export const eventAccessWithUserInclude = {
  user: { include: userWithDetailsInclude },
} as const;
