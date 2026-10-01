import { ApiProperty } from "@nestjs/swagger";
import { EventPlan } from "generated/prisma/client";
import { STRING_LIMITS } from "src/common/constants/schema.constants";
import { EventLimitsResponseDto, EventUsageResponseDto } from "src/plans/dto/event-limits-response.dto";
import { GALLERY_STATES, type GalleryState } from "src/plans/plans.constants";
import { EVENT_STATUSES, type EventStatus } from "../events.constants";
import { EventInviteResponseDto } from "./event-invite-response.dto";

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

  @ApiProperty({
    description:
      "Participant invitation link. Prefer `invites` when present; kept for older clients that expect a single URL.",
  })
  invitationUrl: string;

  @ApiProperty({
    type: [EventInviteResponseDto],
    description:
      "Per-role invitation links. Populated for organizers; empty for other members so invite tokens are not leaked.",
  })
  invites: EventInviteResponseDto[];

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

  @ApiProperty({ enum: EventPlan, enumName: "EventPlan", description: "The plan whose limits apply to this event." })
  plan: EventPlan;

  @ApiProperty({
    enum: GALLERY_STATES,
    enumName: "GalleryState",
    description:
      "OPEN while photos can be added and downloaded. CLOSED once galleryClosesAt has passed: the photos are " +
      "removed and the event itself stays. Separate from status, which is the moderation state.",
  })
  galleryState: GalleryState;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: "When the gallery closes: the event's date plus its plan's window. Null on a plan that never closes.",
  })
  galleryClosesAt: Date | null;

  @ApiProperty({ type: EventLimitsResponseDto })
  limits: EventLimitsResponseDto;

  @ApiProperty({ type: EventUsageResponseDto })
  usage: EventUsageResponseDto;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
