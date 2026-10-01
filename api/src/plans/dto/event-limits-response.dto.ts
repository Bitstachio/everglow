import { ApiProperty } from "@nestjs/swagger";

/** The limits of an event's plan. */
export class EventLimitsResponseDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description: "Members of every role, organizers included; null for no limit.",
  })
  members: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "The gallery's storage, in bytes as a decimal string; null for no limit.",
    example: "3221225472",
  })
  storageBytes: string | null;
}

/** What the event holds now, counted the way its limits are. */
export class EventUsageResponseDto {
  @ApiProperty({ description: "Members of every role, organizers included." })
  members: number;

  @ApiProperty({
    type: String,
    description: "Storage used by the gallery's photos, uploads in progress included, in bytes as a decimal string.",
    example: "1288490188",
  })
  storageBytes: string;
}
