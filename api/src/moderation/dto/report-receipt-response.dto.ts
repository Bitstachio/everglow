import { ApiProperty } from "@nestjs/swagger";
import { ReportReason, ReportStatus, ReportTargetType } from "generated/prisma/client";
import { REPORT_NOTE_MAX_LENGTH } from "../moderation.constants";

/**
 * What the reporter gets back: what they gave, and that it is open. Nothing
 * about who handles it or how it went, so a reporter can't be pressured into
 * passing that on (docs/moderation.md §13).
 */
export class ReportReceiptResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ enum: ReportTargetType, enumName: "ReportTargetType" })
  targetType: ReportTargetType;

  @ApiProperty({ enum: ReportReason, enumName: "ReportReason" })
  reason: ReportReason;

  @ApiProperty({ type: String, nullable: true, maxLength: REPORT_NOTE_MAX_LENGTH })
  note: string | null;

  @ApiProperty({
    enum: ReportStatus,
    enumName: "ReportStatus",
    description: "OPEN on a new report, and on a repeat, which returns the caller's open report.",
  })
  status: ReportStatus;

  @ApiProperty()
  createdAt: Date;
}
