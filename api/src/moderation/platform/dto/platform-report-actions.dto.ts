import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDate, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { ReportHoldReason } from "generated/prisma/client";
import { ResolveReportDto } from "../../dto/resolve-report.dto";

/**
 * The organizer verdicts, given by the platform: on any report in either
 * queue, and on a report whose photo is already gone, where REMOVE_PHOTO
 * upholds it. A report about the event itself takes DISMISS only; suspending
 * or deleting the event are their own endpoints.
 */
export class ResolvePlatformReportDto extends ResolveReportDto {}

export class SetReportHoldDto {
  @ApiProperty({ description: "The retention purge keeps the report and its evidence until then." })
  @Type(() => Date)
  @IsDate()
  until: Date;

  @ApiProperty({ enum: ReportHoldReason, enumName: "ReportHoldReason" })
  @IsEnum(ReportHoldReason)
  reason: ReportHoldReason;
}

export class RecordAuthorityReportDto {
  @ApiProperty({ description: "The CyberTipline report number, or the police file number.", maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  reference: string;

  @ApiPropertyOptional({
    description: "When it was submitted. Defaults to now; the report is held for a year from then.",
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  submittedAt?: Date;
}
