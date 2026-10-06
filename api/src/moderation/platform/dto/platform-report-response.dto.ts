import { ApiProperty } from "@nestjs/swagger";
import { ReportEscalation, ReportHoldReason } from "generated/prisma/client";
import { ReportResponseDto } from "../../dto/report-response.dto";

/** What the report's snapshot recorded (docs/moderation.md §7). Never the object's key or a URL. */
export class ReportEvidenceSummaryDto {
  @ApiProperty({ description: "Whether the reported object was copied to evidence before it was deleted." })
  quarantined: boolean;

  @ApiProperty({ type: String, nullable: true, description: "Hex SHA-256 of the evidence copy." })
  sha256: string | null;

  @ApiProperty({ type: String, nullable: true })
  contentType: string | null;

  @ApiProperty({ type: Number, nullable: true })
  sizeBytes: number | null;

  @ApiProperty({
    format: "uuid",
    type: String,
    nullable: true,
    description: "The reported member, the photo's uploader, or who set the cover, as at filing.",
  })
  subjectUserId: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Their username as at filing." })
  subjectUsername: string | null;
}

/** A report as the platform sees it: everything organizers see, plus who filed it and why it is here. */
export class PlatformReportResponseDto extends ReportResponseDto {
  @ApiProperty({ format: "uuid", type: String, nullable: true, description: "Null once that account is deleted." })
  reporterId: string | null;

  @ApiProperty({ enum: ReportEscalation, enumName: "ReportEscalation", isArray: true })
  escalationReasons: ReportEscalation[];

  @ApiProperty({ type: Date, nullable: true, description: "When it reached the platform's queue." })
  escalatedAt: Date | null;

  @ApiProperty({ type: Date, nullable: true, description: "The retention purge skips the report until then." })
  holdUntil: Date | null;

  @ApiProperty({ enum: ReportHoldReason, enumName: "ReportHoldReason", nullable: true })
  holdReason: ReportHoldReason | null;

  @ApiProperty({ type: String, nullable: true, description: "CyberTipline or police reference." })
  authorityReference: string | null;

  @ApiProperty({ type: ReportEvidenceSummaryDto, nullable: true })
  evidence: ReportEvidenceSummaryDto | null;
}

export class PlatformReportListResponseDto {
  @ApiProperty({ type: [PlatformReportResponseDto] })
  items: PlatformReportResponseDto[];

  @ApiProperty({ type: String, nullable: true, description: "Opaque cursor for the next page; null on the last." })
  nextCursor: string | null;
}

export class EvidenceUrlResponseDto {
  @ApiProperty({ description: "A short-lived GET URL for the reported object, or its evidence copy." })
  url: string;

  @ApiProperty()
  expiresAt: Date;
}
