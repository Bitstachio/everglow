import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { STRING_LIMITS } from "src/common/constants/schema.constants";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./pagination.constants";

/** Query parameters of every keyset-paginated list; extend it to add filters. */
export class CursorPageQueryDto {
  @ApiPropertyOptional({
    maxLength: STRING_LIMITS.STANDARD,
    description: "Opaque cursor: the nextCursor value from the previous page. Omit for the first page.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(STRING_LIMITS.STANDARD)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}
