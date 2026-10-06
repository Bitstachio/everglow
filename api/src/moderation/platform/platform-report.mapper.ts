import { Report, ReportEvidence } from "generated/prisma/client";
import { KeysetPage } from "src/common/pagination/keyset-cursor";
import { ReportMapper } from "../mappers/report.mapper";
import { PlatformReportListResponseDto, PlatformReportResponseDto } from "./dto/platform-report-response.dto";

export type ReportWithEvidence = Report & { evidence: ReportEvidence | null };

export class PlatformReportMapper {
  static toResponseDto(report: ReportWithEvidence): PlatformReportResponseDto {
    const { evidence } = report;
    return {
      ...ReportMapper.toResponseDto(report),
      reporterId: report.reporterId,
      escalationReasons: report.escalationReasons,
      escalatedAt: report.escalatedAt,
      holdUntil: report.holdUntil,
      holdReason: report.holdReason,
      authorityReference: report.authorityReference,
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

  static toListResponseDto(page: KeysetPage<ReportWithEvidence>): PlatformReportListResponseDto {
    return {
      items: page.items.map((report) => PlatformReportMapper.toResponseDto(report)),
      nextCursor: page.nextCursor,
    };
  }
}
