import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { STRING_LIMITS } from "src/common/constants/schema.constants";

export class CreateEventDto {
  @ApiProperty({ maxLength: STRING_LIMITS.TITLE })
  @IsString()
  @IsNotEmpty()
  @MaxLength(STRING_LIMITS.TITLE)
  title: string;

  @ApiPropertyOptional({ maxLength: STRING_LIMITS.STANDARD })
  @IsOptional()
  @IsString()
  @MaxLength(STRING_LIMITS.STANDARD)
  description?: string;

  @ApiProperty({
    format: "date-time",
    description:
      "When the event takes place: any past date, or at most 12 months ahead (newEvent.latestDate on " +
      "GET /users/me/limits). The gallery opens then, or as soon as the event is created if that has passed.",
  })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({
    minimum: 1,
    description:
      "How many days the gallery stays open once it opens: one of newEvent.galleryWindowOptions on " +
      "GET /users/me/limits. Defaults to the longest.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  galleryWindowDays?: number;
}
