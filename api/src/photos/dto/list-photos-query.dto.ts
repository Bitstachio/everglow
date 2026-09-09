import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { STRING_LIMITS } from "src/common/constants/schema.constants";
import { DEFAULT_PHOTO_PAGE_SIZE, MAX_PHOTO_PAGE_SIZE } from "../photos.constants";

export class ListPhotosQueryDto {
  @ApiPropertyOptional({
    maxLength: STRING_LIMITS.STANDARD,
    description: "Opaque cursor: the nextCursor value from the previous page. Omit for the first page.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(STRING_LIMITS.STANDARD)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PHOTO_PAGE_SIZE, default: DEFAULT_PHOTO_PAGE_SIZE })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PHOTO_PAGE_SIZE)
  limit?: number;
}
