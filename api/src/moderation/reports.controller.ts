import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import type { AuthenticatedUser } from "src/auth/auth.types";
import { CurrentUser } from "src/auth/current-user.decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { RateLimit } from "src/common/rate-limit/rate-limit.decorator";
import { ApiWrappedResponse } from "src/common/swagger/api-wrapped-response.decorator";
import { CreateReportDto } from "./dto/create-report.dto";
import { ListReportsQueryDto } from "./dto/list-reports-query.dto";
import { ReportListResponseDto } from "./dto/report-list-response.dto";
import { ReportResponseDto } from "./dto/report-response.dto";
import { ResolveReportDto } from "./dto/resolve-report.dto";
import { ReportMapper } from "./mappers/report.mapper";
import { ReportsService } from "./reports.service";

@ApiTags("moderation")
@ApiBearerAuth("access-token")
@Controller()
@UseGuards(JwtAuthGuard)
@ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post("photos/:photoId/reports")
  @RateLimit("sensitive")
  @ApiOperation({
    summary: "Report a photo",
    description:
      "Any member of the photo's event. The photo is hidden from the reporter at once. " +
      "Idempotent: while the caller's earlier report on the photo is still OPEN, that report is returned.",
  })
  @ApiWrappedResponse(ReportResponseDto, "The caller's open report on the photo", 201)
  async reportPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param("photoId", ParseUUIDPipe) photoId: string,
    @Body() dto: CreateReportDto,
  ): Promise<ReportResponseDto> {
    return ReportMapper.toResponseDto(await this.reportsService.reportPhoto(photoId, user.id, dto));
  }

  @Post("events/:eventId/participants/:targetUserId/reports")
  @RateLimit("sensitive")
  @ApiOperation({
    summary: "Report a member of an event",
    description:
      "Any member of the event, about any other member. " +
      "Idempotent: while the caller's earlier report on the member is still OPEN, that report is returned.",
  })
  @ApiWrappedResponse(ReportResponseDto, "The caller's open report on the member", 201)
  async reportMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Param("targetUserId", ParseUUIDPipe) targetUserId: string,
    @Body() dto: CreateReportDto,
  ): Promise<ReportResponseDto> {
    return ReportMapper.toResponseDto(await this.reportsService.reportMember(eventId, targetUserId, user.id, dto));
  }

  @Get("events/:eventId/reports")
  @ApiOperation({ summary: "List an event's reports (organizers only, cursor-paginated)" })
  @ApiWrappedResponse(ReportListResponseDto, "Reports, newest first")
  async listReports(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Query() query: ListReportsQueryDto,
  ): Promise<ReportListResponseDto> {
    return ReportMapper.toListResponseDto(await this.reportsService.listReports(eventId, user.id, query));
  }

  @Patch("reports/:reportId")
  @RateLimit("sensitive")
  @ApiOperation({
    summary: "Resolve a report (organizers only)",
    description: "Not available to the organizer the report is about. Resolving never deletes anything by itself.",
  })
  @ApiWrappedResponse(ReportResponseDto, "Resolved report")
  async resolveReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @Body() dto: ResolveReportDto,
  ): Promise<ReportResponseDto> {
    return ReportMapper.toResponseDto(
      await this.reportsService.resolveReport(reportId, user.id, dto.action, dto.photos),
    );
  }
}
