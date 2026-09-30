import { AbilityBuilder } from "@casl/ability";
import { AccessLevel, ReportTargetType } from "generated/prisma/client";
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

  // Organizers read the event's reports about photos and members, and resolve
  // them. Reports about the event itself are about their own content, so they
  // go to the platform owner only (docs/moderation.md).
  const organizerReviewable = {
    targetType: { in: [ReportTargetType.PHOTO, ReportTargetType.MEMBER] },
    event: { is: { eventAccesses: { some: { userId: user.id, accessLevel: AccessLevel.ORGANIZER } } } },
  };
  can(REPORT_ACTIONS.READ, REPORT_SUBJECT, organizerReviewable);
  can(REPORT_ACTIONS.UPDATE, REPORT_SUBJECT, organizerReviewable);
};
