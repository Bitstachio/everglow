import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { ReportReason } from "generated/prisma/client";
import { REPORT_NOTE_MAX_LENGTH, REPORT_NOTE_PATTERN } from "../moderation.constants";

/** The target comes from the route (a photo or a member), so the body is the same for both. */
export class CreateReportDto {
  @ApiProperty({ enum: ReportReason, enumName: "ReportReason" })
  @IsEnum(ReportReason)
  reason: ReportReason;

  @ApiPropertyOptional({
    maxLength: REPORT_NOTE_MAX_LENGTH,
    description:
      "Optional context for the organizers, in the reporter's own words. Trimmed before validation; it must " +
      "not be empty then, and may contain newlines but no other control characters (400 otherwise).",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(REPORT_NOTE_MAX_LENGTH)
  @Matches(REPORT_NOTE_PATTERN, { message: "note must not contain control characters other than a newline" })
  note?: string;
}
