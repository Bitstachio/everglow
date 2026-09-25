import { Report } from "generated/prisma/client";
import { KeysetPage } from "src/common/pagination/keyset-cursor";
import { ReportListResponseDto } from "../dto/report-list-response.dto";
import { ReportResponseDto } from "../dto/report-response.dto";

export class ReportMapper {
  // reporterId stays behind on purpose: see ReportResponseDto.
  static toResponseDto(report: Report): ReportResponseDto {
    return {
      id: report.id,
      eventId: report.eventId,
      targetType: report.targetType,
      photoId: report.photoId,
      reportedUserId: report.reportedUserId,
      reason: report.reason,
      note: report.note,
      status: report.status,
      resolvedById: report.resolvedById,
      resolvedAt: report.resolvedAt,
      createdAt: report.createdAt,
    };
  }

  static toListResponseDto(page: KeysetPage<Report>): ReportListResponseDto {
    return {
      items: page.items.map((report) => ReportMapper.toResponseDto(report)),
      nextCursor: page.nextCursor,
    };
  }
}
