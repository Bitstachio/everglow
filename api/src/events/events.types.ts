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
};

export const eventAccessWithUserInclude = {
  user: { include: userWithDetailsInclude },
} as const;
