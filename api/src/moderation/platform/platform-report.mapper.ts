import { Report, ReportEvidence } from "generated/prisma/client";
import { KeysetPage } from "src/common/pagination/keyset-cursor";
import { ReportMapper } from "../mappers/report.mapper";
import {
  PlatformReportListItemDto,
  PlatformReportListResponseDto,
  PlatformReportResponseDto,
} from "./dto/platform-report-response.dto";

export type ReportWithEvidence = Report & { evidence: ReportEvidence | null };

export class PlatformReportMapper {
  /** A report on a queue page: no authority reference, which only the report's own page shows. */
  static toListItemDto(report: ReportWithEvidence): PlatformReportListItemDto {
    const { evidence } = report;
    return {
      ...ReportMapper.toResponseDto(report),
      reporterId: report.reporterId,
      resolvedById: report.resolvedById,
      escalationReasons: report.escalationReasons,
      escalatedAt: report.escalatedAt,
      holdUntil: report.holdUntil,
      holdReason: report.holdReason,
      evidence: evidence && {
        quarantined: evidence.evidenceS3Key !== null,
        sha256: evidence.sha256,
        contentType: evidence.contentType,
        sizeBytes: evidence.sizeBytes,
        subjectUserId: evidence.subjectUserId,
        subjectUsername: evidence.subjectUsername,
      },
    };
  }

  static toResponseDto(report: ReportWithEvidence): PlatformReportResponseDto {
    return {
      ...PlatformReportMapper.toListItemDto(report),
      authorityReference: report.authorityReference,
    };
  }

  static toListResponseDto(page: KeysetPage<ReportWithEvidence>): PlatformReportListResponseDto {
    return {
      items: page.items.map((report) => PlatformReportMapper.toListItemDto(report)),
      nextCursor: page.nextCursor,
    };
  }
}
