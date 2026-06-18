import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { STRING_LIMITS } from "src/common/constants/schema.constants";

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(STRING_LIMITS.TITLE)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(STRING_LIMITS.STANDARD)
  description?: string;

  @IsDateString()
  date: string;
}
