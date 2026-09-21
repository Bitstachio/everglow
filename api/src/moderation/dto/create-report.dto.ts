import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { ReportReason } from "generated/prisma/client";
import { REPORT_NOTE_MAX_LENGTH } from "../moderation.constants";

/** The target comes from the route (a photo or a member), so the body is the same for both. */
export class CreateReportDto {
  @ApiProperty({ enum: ReportReason, enumName: "ReportReason" })
  @IsEnum(ReportReason)
  reason: ReportReason;

  @ApiPropertyOptional({
    maxLength: REPORT_NOTE_MAX_LENGTH,
    description: "Optional context for the organizers, in the reporter's own words.",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(REPORT_NOTE_MAX_LENGTH)
  note?: string;
}
