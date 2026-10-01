import { ApiProperty } from "@nestjs/swagger";
import {
  AccountLimitsResponseDto,
  AccountUsageResponseDto,
  ClosingEventResponseDto,
} from "src/plans/dto/account-limits-response.dto";
import { ACCOUNT_PLANS, type AccountPlan } from "src/plans/plans.constants";

export class UserLimitsResponseDto {
  @ApiProperty({
    enum: ACCOUNT_PLANS,
    enumName: "AccountPlan",
    description: "The caller's account plan. Every account is FREE until a host subscription exists.",
  })
  plan: AccountPlan;

  @ApiProperty({ type: AccountLimitsResponseDto })
  limits: AccountLimitsResponseDto;

  @ApiProperty({ type: AccountUsageResponseDto })
  usage: AccountUsageResponseDto;

  @ApiProperty({
    type: () => ClosingEventResponseDto,
    nullable: true,
    description:
      "The caller's active event whose gallery closes first, which frees a place for a new one; " +
      "null when none of their active events is set to close.",
  })
  nextClosingEvent: ClosingEventResponseDto | null;
}
