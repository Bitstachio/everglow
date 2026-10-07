import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { AuthenticatedUser } from "src/auth/auth.types";
import { CurrentUser } from "src/auth/current-user.decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { ApiWrappedResponse } from "src/common/swagger/api-wrapped-response.decorator";
import { ReportsService } from "../reports.service";
import { ListPlatformReportsQueryDto } from "./dto/list-platform-reports-query.dto";
import {
  RecordAuthorityReportDto,
  ResolvePlatformReportDto,
  SetReportHoldDto,
} from "./dto/platform-report-actions.dto";
import {
  EvidenceUrlResponseDto,
  PlatformReportListResponseDto,
  PlatformReportResponseDto,
} from "./dto/platform-report-response.dto";
import { PlatformModerationService } from "./platform-moderation.service";
import { PlatformModeratorGuard } from "./platform-moderator.guard";
import { PlatformReportMapper } from "./platform-report.mapper";

/**
 * The platform's moderation tools (docs/moderation.md §8). Platform
 * moderators only: anyone else gets 403 PLATFORM_MODERATOR_ONLY. Not rate
 * limited per user; every action is audit-logged.
 */
@ApiTags("admin")
@ApiBearerAuth("access-token")
@Controller("admin")
@UseGuards(JwtAuthGuard, PlatformModeratorGuard)
@ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
@ApiForbiddenResponse({ description: "PLATFORM_MODERATOR_ONLY: the caller is not a platform moderator" })
export class PlatformModerationController {
  constructor(
    private readonly platformModerationService: PlatformModerationService,
    private readonly reportsService: ReportsService,
  ) {}

  @Get("reports")
  @ApiOperation({
    summary: "List reports across events (platform moderators)",
    description: "The platform's OPEN reports by default, oldest first. Filter by queue, status or event.",
  })
  @ApiWrappedResponse(PlatformReportListResponseDto, "Reports, oldest first")
  async listReports(@Query() query: ListPlatformReportsQueryDto): Promise<PlatformReportListResponseDto> {
    return PlatformReportMapper.toListResponseDto(await this.platformModerationService.listReports(query));
  }

  @Get("reports/:reportId")
  @ApiOperation({ summary: "Get a report with who filed it and its evidence summary (platform moderators)" })
  @ApiWrappedResponse(PlatformReportResponseDto, "The report")
  async getReport(@Param("reportId", ParseUUIDPipe) reportId: string): Promise<PlatformReportResponseDto> {
    return PlatformReportMapper.toResponseDto(await this.platformModerationService.getReport(reportId));
  }

  @Post("reports/:reportId/evidence-url")
  @ApiOperation({
    summary: "Get a short-lived link to what a report is about (platform moderators)",
    description:
      "The evidence copy once there is one, the live object before that. Expires after 5 minutes. Every link is " +
      "logged. 404 EVIDENCE_NOT_AVAILABLE for a member report, or a report whose object was never kept.",
  })
  @ApiWrappedResponse(EvidenceUrlResponseDto, "A GET URL and when it expires", 201)
  async evidenceUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param("reportId", ParseUUIDPipe) reportId: string,
  ): Promise<EvidenceUrlResponseDto> {
    return this.platformModerationService.evidenceUrl(reportId, user.id);
  }

  @Patch("reports/:reportId")
  @ApiOperation({
    summary: "Resolve any report (platform moderators)",
    description:
      "The organizer verdicts, on any OPEN report in either queue. Closes every OPEN report on the same target. " +
      "REMOVE_PHOTO on a photo that is already gone upholds the reports. A report about the event itself takes " +
      "DISMISS only. 409 REPORT_ALREADY_RESOLVED once it is closed.",
  })
  @ApiWrappedResponse(PlatformReportResponseDto, "The resolved report")
  async resolveReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @Body() dto: ResolvePlatformReportDto,
  ): Promise<PlatformReportResponseDto> {
    await this.reportsService.resolveAsPlatform(reportId, user.id, dto.action, dto.photos);
    return PlatformReportMapper.toResponseDto(await this.platformModerationService.getReport(reportId));
  }

  @Put("reports/:reportId/hold")
  @ApiOperation({ summary: "Hold a report and its evidence past the retention window (platform moderators)" })
  @ApiWrappedResponse(PlatformReportResponseDto, "The held report")
  async setHold(
    @CurrentUser() user: AuthenticatedUser,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @Body() dto: SetReportHoldDto,
  ): Promise<PlatformReportResponseDto> {
    return PlatformReportMapper.toResponseDto(
      await this.platformModerationService.setHold(reportId, user.id, dto.until, dto.reason),
    );
  }

  @Delete("reports/:reportId/hold")
  @ApiOperation({ summary: "Release a report's hold (platform moderators)" })
  @ApiWrappedResponse(PlatformReportResponseDto, "The report, no longer held")
  async releaseHold(
    @CurrentUser() user: AuthenticatedUser,
    @Param("reportId", ParseUUIDPipe) reportId: string,
  ): Promise<PlatformReportResponseDto> {
    return PlatformReportMapper.toResponseDto(await this.platformModerationService.releaseHold(reportId, user.id));
  }

  @Put("reports/:reportId/authority-report")
  @ApiOperation({
    summary: "Record that a report went to NCMEC or the police (platform moderators)",
    description: "Stores the reference and holds the report and its evidence for a year from the submission.",
  })
  @ApiWrappedResponse(PlatformReportResponseDto, "The report")
  async recordAuthorityReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @Body() dto: RecordAuthorityReportDto,
  ): Promise<PlatformReportResponseDto> {
    return PlatformReportMapper.toResponseDto(
      await this.platformModerationService.recordAuthorityReport(reportId, user.id, dto.reference, dto.submittedAt),
    );
  }

  @Post("events/:eventId/lift-review")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Lift an event's review (platform moderators)",
    description: "Joins and uploads work again. Idempotent. Its reports stay as they are; resolve them separately.",
  })
  @ApiNoContentResponse({ description: "Review lifted (empty data envelope at runtime)" })
  async liftReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
  ): Promise<void> {
    await this.platformModerationService.liftReview(eventId, user.id);
  }
}
