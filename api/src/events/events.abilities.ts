import { AbilityBuilder } from "@casl/ability";
import { AccessLevel } from "generated/prisma/client";
import { AbilityUserContext, AppAbility } from "src/casl/ability.types";

export const EVENT_ACTIONS = {
  READ: "read",
  CREATE: "create",
  DELETE: "delete",
} as const;

export const EVENT_SUBJECT = "Event" as const;

export type EventAction = (typeof EVENT_ACTIONS)[keyof typeof EVENT_ACTIONS];

export const defineEventAbilities = (can: AbilityBuilder<AppAbility>["can"], user: AbilityUserContext): void => {
  if (!user.isOnboarded) return;

  can(EVENT_ACTIONS.CREATE, EVENT_SUBJECT);
  can(EVENT_ACTIONS.READ, EVENT_SUBJECT, { creatorId: user.id });
  can(EVENT_ACTIONS.READ, EVENT_SUBJECT, { eventAccesses: { some: { userId: user.id } } });
  can(EVENT_ACTIONS.DELETE, EVENT_SUBJECT, {
    eventAccesses: { some: { userId: user.id, accessLevel: AccessLevel.ORGANIZER } },
  });
};
