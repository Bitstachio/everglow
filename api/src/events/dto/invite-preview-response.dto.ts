import { ApiProperty } from "@nestjs/swagger";
import { GALLERY_STATES, type GalleryState } from "src/plans/plans.constants";
import { INVITE_PREVIEW_STATES, type InvitePreviewState } from "../events.constants";
import { INVITE_ACCESS_LEVELS, type EventInviteAccessLevel } from "../events.invitation";

export class InviteHostResponseDto {
  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiProperty({ nullable: true, type: String, description: "Null once their profile is gone." })
  name: string | null;
}

/** What an invite leads to, for someone deciding whether to join. No cover or photos: only members see those. */
export class InvitePreviewResponseDto {
  @ApiProperty({
    enum: INVITE_PREVIEW_STATES,
    enumName: "InvitePreviewState",
    description:
      "JOINABLE when POST /events/join would succeed now. Otherwise the code it would refuse with, checked in " +
      "the same order: ALREADY_A_MEMBER, EVENT_GALLERY_CLOSED, REMOVED_FROM_EVENT, EVENT_SUSPENDED, " +
      "EVENT_UNDER_REVIEW, ORGANIZER_BLOCKED_BY_CALLER, EVENT_MEMBER_LIMIT_REACHED. The member count is read " +
      "without the join lock, so a join can still be refused with EVENT_MEMBER_LIMIT_REACHED.",
  })
  state: InvitePreviewState;

  @ApiProperty({
    format: "uuid",
    nullable: true,
    type: String,
    description: "The event's id, only when the caller is already a member (ALREADY_A_MEMBER); null otherwise.",
  })
  eventId: string | null;

  @ApiProperty({ maxLength: 100 })
  title: string;

  @ApiProperty()
  date: Date;

  @ApiProperty({
    description: "The invite's shareable link, as organizers share it: what a QR code on the envelope carries.",
  })
  invitationUrl: string;

  @ApiProperty({
    enum: INVITE_ACCESS_LEVELS,
    enumName: "InviteAccessLevel",
    description: "What joining with this invite grants: PARTICIPANT adds photos, VIEWER only looks.",
  })
  accessLevel: EventInviteAccessLevel;

  @ApiProperty({ enum: GALLERY_STATES, enumName: "GalleryState" })
  galleryState: GalleryState;

  @ApiProperty({ description: "When the gallery opens." })
  galleryOpensAt: Date;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: "When the gallery closes and its photos are removed. Null on a plan that never closes.",
  })
  galleryClosesAt: Date | null;

  @ApiProperty({ description: "Members of every role, organizers included." })
  memberCount: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: "How many members the event's plan allows, every role counted; null for no limit.",
  })
  memberLimit: number | null;

  @ApiProperty({
    type: InviteHostResponseDto,
    nullable: true,
    description:
      "Who hosts the event: the organizer the caller blocked when the state is ORGANIZER_BLOCKED_BY_CALLER, " +
      "so they can be unblocked; otherwise the creator while they organize it, or the longest-standing " +
      "organizer. Null when no organizer is left.",
  })
  host: InviteHostResponseDto | null;
}
