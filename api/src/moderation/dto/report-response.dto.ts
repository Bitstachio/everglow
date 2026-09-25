import { ApiProperty } from "@nestjs/swagger";
import { ReportReason, ReportStatus, ReportTargetType } from "generated/prisma/client";
import { REPORT_NOTE_MAX_LENGTH } from "../moderation.constants";

/** Deliberately without the reporter: organizers act on a report without learning who filed it. */
export class ReportResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  eventId: string;

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

  @ApiProperty({ enum: ReportStatus, enumName: "ReportStatus" })
  status: ReportStatus;

  @ApiProperty({
    format: "uuid",
    nullable: true,
    type: String,
    description: "The organizer who resolved the report. Null while OPEN, and once that account has been deleted.",
  })
  resolvedById: string | null;

  @ApiProperty({ type: Date, nullable: true })
  resolvedAt: Date | null;

  @ApiProperty()
  createdAt: Date;
}
