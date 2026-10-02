import { ApiProperty } from "@nestjs/swagger";
import { EventPlan } from "generated/prisma/client";

/** The limits of an account's plan. */
export class AccountLimitsResponseDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      "Events the caller created that haven't closed, upcoming ones included, at once; null for no limit. " +
      "Joined events never count.",
  })
  activeEvents: number | null;
}

/** What the account holds now, counted the way its limits are. */
export class AccountUsageResponseDto {
  @ApiProperty({ description: "Events the caller created that haven't closed, upcoming ones included." })
  activeEvents: number;
}

/** What a new event gets, and so what the create form offers. */
export class NewEventResponseDto {
  @ApiProperty({ enum: EventPlan, enumName: "EventPlan", description: "The plan a new event is created on." })
  plan: EventPlan;

  @ApiProperty({
    type: [Number],
    description: "The gallery lengths, in days, the host can pick, shortest first.",
    example: [3, 7, 14, 30],
  })
  galleryWindowOptions: number[];

  @ApiProperty({
    type: Number,
    nullable: true,
    description: "The length a new event gets when none is picked: the longest. Null on a plan that never closes.",
  })
  defaultGalleryWindowDays: number | null;

  @ApiProperty({ description: "The latest date a new event can have, 12 months from now. Any past date is allowed." })
  latestDate: Date;
}

/** An active event and when its gallery closes. */
export class ClosingEventResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ maxLength: 100 })
  title: string;

  @ApiProperty({ description: "When the gallery closes; from then on the event no longer counts as active." })
  galleryClosesAt: Date;
}
