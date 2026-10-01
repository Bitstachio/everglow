import { AccountLimits, AccountUsage } from "src/plans/event-plan.service";
import { UserLimitsResponseDto } from "../dto/user-limits-response.dto";
import { UserResponseDto } from "../dto/user-response.dto";
import { UserWithDetails } from "../users.types";

export class UserMapper {
  static toResponseDto(
    user: UserWithDetails,
    avatarUrl: string | null,
    usernameChangeAvailableAt: Date | null,
  ): UserResponseDto {
    return {
      id: user.id,
      isOnboarded: !!user.details,
      details: user.details
        ? {
            username: user.details.username,
            name: user.details.name,
            avatarUrl,
            usernameChangeAvailableAt,
            createdAt: user.details.createdAt,
            updatedAt: user.details.updatedAt,
          }
        : null,
      termsAcceptedAt: user.termsAcceptedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /** `limits` and `usage` come from EventPlanService (accountLimitsFor, accountUsageFor). */
  static toLimitsResponseDto(limits: AccountLimits, usage: AccountUsage): UserLimitsResponseDto {
    const next = usage.nextClosingEvent;
    return {
      plan: limits.plan,
      limits: { activeEvents: limits.maxActiveEvents },
      usage: { activeEvents: usage.activeEvents },
      nextClosingEvent: next ? { id: next.id, title: next.title, galleryClosesAt: next.galleryClosesAt } : null,
    };
  }
}
