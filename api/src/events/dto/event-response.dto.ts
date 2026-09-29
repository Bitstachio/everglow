import { ApiProperty } from "@nestjs/swagger";
import { STRING_LIMITS } from "src/common/constants/schema.constants";
import { EVENT_STATUSES, type EventStatus } from "../events.constants";

export class EventResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ maxLength: 100 })
  title: string;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty()
  date: Date;

  @ApiProperty({
    format: "uuid",
    nullable: true,
    type: String,
    description: "Who created the event; null once that account has been deleted. Not a permission: see accessLevel.",
  })
  creatorId: string | null;

  @ApiProperty({ description: "Shareable invitation link composed from the stored invite token" })
  invitationUrl: string;

  @ApiProperty({
    nullable: true,
    type: String,
    maxLength: STRING_LIMITS.LONG,
    description:
      "Short-lived presigned URL of the event cover image; null when none is set, " +
      "or while it is hidden from the caller after a report of the event",
  })
  coverUrl: string | null;

  @ApiProperty({
    enum: EVENT_STATUSES,
    enumName: "EventStatus",
    description:
      "UNDER_REVIEW once enough members have reported the event itself: members keep access, " +
      "but no one can join and no photos can be added until the platform finishes its review.",
  })
  status: EventStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
