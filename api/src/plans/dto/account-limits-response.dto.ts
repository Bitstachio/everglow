import { ApiProperty } from "@nestjs/swagger";

/** The limits of an account's plan. */
export class AccountLimitsResponseDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      "Events the caller created whose galleries are still open, at once; null for no limit. Joined events never count.",
  })
  activeEvents: number | null;
}

/** What the account holds now, counted the way its limits are. */
export class AccountUsageResponseDto {
  @ApiProperty({ description: "Events the caller created whose galleries are still open." })
  activeEvents: number;
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
