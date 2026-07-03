import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { DEFAULT_PHOTO_PAGE_SIZE, MAX_PHOTO_PAGE_SIZE } from "../photos.constants";

export class ListPhotosQueryDto {
  @ApiPropertyOptional({ format: "uuid", description: "ID of the last photo from the previous page" })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PHOTO_PAGE_SIZE, default: DEFAULT_PHOTO_PAGE_SIZE })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PHOTO_PAGE_SIZE)
  limit?: number;
}
