import { ApiProperty } from "@nestjs/swagger";
import { STRING_LIMITS } from "src/common/constants/schema.constants";
import { EVENT_MEMBERSHIP, type EventMembership } from "../photos.constants";

export class EventStorageUsageResponseDto {
  @ApiProperty({ format: "uuid" })
  eventId: string;

  @ApiProperty()
  title: string;

  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: STRING_LIMITS.LONG,
    description: "Short-lived presigned URL of the event cover; null when none is set",
  })
  coverUrl: string | null;

  @ApiProperty({
    enum: Object.values(EVENT_MEMBERSHIP),
    enumName: "EventMembership",
    description:
      "MEMBER: still in the event. LEFT: left on their own (can rejoin through the link). " +
      "REMOVED: an organizer removed them. Photos count toward storage in every case.",
  })
  membership: EventMembership;

  @ApiProperty({ description: "Photos the caller uploaded to this event, including uploads still in progress" })
  photoCount: number;

  @ApiProperty({ description: "Bytes those photos use; the rows add up to usedBytes", example: "1288490188" })
  bytes: string;
}
