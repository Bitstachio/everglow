import { ApiPropertyOptional, PartialType, PickType } from "@nestjs/swagger";
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { STRING_LIMITS } from "src/common/constants/schema.constants";
import { CreateEventDto } from "./create-event.dto";

/**
 * The date and the gallery length are the event's schedule: they can change
 * only while the event is upcoming (docs/event-quotas.md). Sending the current
 * value is not a change, so a form that sends every field still works.
 */
export class UpdateEventDto extends PartialType(PickType(CreateEventDto, ["title"] as const)) {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: STRING_LIMITS.STANDARD,
    description: "A new description, or null to remove it.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(STRING_LIMITS.STANDARD)
  description?: string | null;

  @ApiPropertyOptional({
    format: "date-time",
    description:
      "A new date, any past one or at most 12 months ahead. Only while the event is upcoming, otherwise " +
      "EVENT_SCHEDULE_LOCKED. The gallery then opens on it, or right away if it has passed.",
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    minimum: 1,
    description:
      "A new gallery length, one of the event's galleryWindowOptions. Only while the event is upcoming, " +
      "otherwise EVENT_SCHEDULE_LOCKED.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  galleryWindowDays?: number;
}
