import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";
import { CursorPageQueryDto } from "src/common/pagination/cursor-page-query.dto";

export class ListPhotosQueryDto extends CursorPageQueryDto {
  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Only photos this person added, with the same visibility, order and paging as the full list. Works for " +
      "former members whose photos were kept. A blocked uploader, or anyone with no photos the caller can see, " +
      "gets an empty page.",
  })
  @IsOptional()
  // "loose" accepts the same ids ParseUUIDPipe accepts on path parameters.
  @IsUUID("loose")
  addedById?: string;
}
