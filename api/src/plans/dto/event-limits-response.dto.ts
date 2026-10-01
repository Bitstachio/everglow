import { ApiProperty } from "@nestjs/swagger";

/** The user-facing limits of an event's plan. The gallery byte cap is a safety net and stays hidden. */
export class EventLimitsResponseDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description: "Members of every role, organizers included; null for no limit.",
  })
  members: number | null;

  @ApiProperty({ type: Number, nullable: true, description: "Photos in the gallery; null for no limit." })
  photos: number | null;
}

/** What the event holds now, counted the way its limits are. */
export class EventUsageResponseDto {
  @ApiProperty({ description: "Members of every role, organizers included." })
  members: number;

  @ApiProperty({ description: "Photos in the gallery, uploads in progress included." })
  photos: number;
}
