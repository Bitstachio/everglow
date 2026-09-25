import { AbilityBuilder } from "@casl/ability";
import { AccessLevel } from "generated/prisma/client";
import { AbilityUserContext, AppAbility } from "src/casl/ability.types";

export const REPORT_ACTIONS = {
  READ: "read",
  CREATE: "create",
  UPDATE: "update",
} as const;

export const REPORT_SUBJECT = "Report" as const;

export type ReportAction = (typeof REPORT_ACTIONS)[keyof typeof REPORT_ACTIONS];

export const defineReportAbilities = (can: AbilityBuilder<AppAbility>["can"], user: AbilityUserContext): void => {
  if (!user.isOnboarded) return;

  // Any member, viewers included, can file a report in their own name.
  can(REPORT_ACTIONS.CREATE, REPORT_SUBJECT, {
    reporterId: user.id,
    event: { is: { eventAccesses: { some: { userId: user.id } } } },
  });

  // Organizers read the event's reports and resolve them.
  can(REPORT_ACTIONS.READ, REPORT_SUBJECT, {
    event: { is: { eventAccesses: { some: { userId: user.id, accessLevel: AccessLevel.ORGANIZER } } } },
  });
  can(REPORT_ACTIONS.UPDATE, REPORT_SUBJECT, {
    event: { is: { eventAccesses: { some: { userId: user.id, accessLevel: AccessLevel.ORGANIZER } } } },
  });
};
