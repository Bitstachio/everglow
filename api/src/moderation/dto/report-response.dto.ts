import { ApiProperty } from "@nestjs/swagger";
import {
  ReportActorRole,
  ReportClosedReason,
  ReportQueue,
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from "generated/prisma/client";
import { REPORT_NOTE_MAX_LENGTH } from "../moderation.constants";

/** Deliberately without the reporter: organizers act on a report without learning who filed it. */
export class ReportResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({
    format: "uuid",
    nullable: true,
    type: String,
    description: "Null once the event has been deleted; only closed reports outlive their event.",
  })
  eventId: string | null;

  @ApiProperty({ description: "The event's title when the report was filed." })
  eventTitle: string;

  @ApiProperty({ enum: ReportTargetType, enumName: "ReportTargetType" })
  targetType: ReportTargetType;

  @ApiProperty({
    format: "uuid",
    nullable: true,
    type: String,
    description: "The reported photo. Null for MEMBER reports, and once the photo has been deleted.",
  })
  photoId: string | null;

  @ApiProperty({
    format: "uuid",
    nullable: true,
    type: String,
    description:
      "The reported member, or the uploader of the reported photo. Null once that account has been deleted, " +
      "or when the photo had no uploader left.",
  })
  reportedUserId: string | null;

  @ApiProperty({ enum: ReportReason, enumName: "ReportReason" })
  reason: ReportReason;

  @ApiProperty({ type: String, nullable: true, maxLength: REPORT_NOTE_MAX_LENGTH })
  note: string | null;

  @ApiProperty({
    enum: ReportStatus,
    enumName: "ReportStatus",
    description:
      "ACTIONED: something was removed. DISMISSED: judged and left as it is. TARGET_GONE: closed without a " +
      "verdict because what was reported was deleted.",
  })
  status: ReportStatus;

  @ApiProperty({
    enum: ReportQueue,
    enumName: "ReportQueue",
    description:
      "Who handles the report: ORGANIZERS, or PLATFORM once it is about an organizer, the gallery has closed, " +
      "organizers left it for 24 hours, or an organizer dismissed a severe report. Organizers can't close " +
      "PLATFORM reports (403 REPORT_ESCALATED).",
  })
  queue: ReportQueue;

  @ApiProperty({
    enum: ReportClosedReason,
    enumName: "ReportClosedReason",
    nullable: true,
    description: "Why the report closed. Null while OPEN, and on reports closed before it was recorded.",
  })
  closedReason: ReportClosedReason | null;

  @ApiProperty({
    enum: ReportActorRole,
    enumName: "ReportActorRole",
    nullable: true,
    description:
      "In which capacity it was closed: ORGANIZER, PLATFORM, SUBJECT (the person it is about, e.g. deleting " +
      "their own photo) or SYSTEM. Null while OPEN, and on reports closed before it was recorded.",
  })
  closedByRole: ReportActorRole | null;

  @ApiProperty({
    format: "uuid",
    nullable: true,
    type: String,
    description:
      "Who closed the report, in the role closedByRole says. Null while OPEN, when nobody acted (SYSTEM), " +
      "when the platform closed it, and once that account has been deleted.",
  })
  resolvedById: string | null;

  @ApiProperty({ type: Date, nullable: true })
  resolvedAt: Date | null;

  @ApiProperty()
  createdAt: Date;
}
