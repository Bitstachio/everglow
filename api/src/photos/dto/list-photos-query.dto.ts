import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayUnique, IsArray, IsDateString, IsEnum, IsOptional, IsUUID } from "class-validator";
import { AccessLevel } from "generated/prisma/client";
import { CursorPageQueryDto } from "src/common/pagination/cursor-page-query.dto";

/** Query string may send one value or many; class-transformer keeps a single string otherwise. */
const toOptionalStringArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value == null || value === "") return undefined;
  const list = (Array.isArray(value) ? value : [value]).filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
  return list.length > 0 ? list : undefined;
};

/** How many uploaders / roles one list request may ask for. */
const MAX_FILTER_VALUES = 100;

export class ListPhotosQueryDto extends CursorPageQueryDto {
  @ApiPropertyOptional({
    type: String,
    format: "uuid",
    isArray: true,
    description:
      "Only photos these people added (OR). Same visibility, order and paging as the full list. Works for " +
      "former members whose photos were kept. Blocked uploaders, or ids with no photos the caller can see, " +
      "yield an empty page. Omit for everyone.",
  })
  @IsOptional()
  @Transform(toOptionalStringArray)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  // "loose" accepts the same ids ParseUUIDPipe accepts on path parameters.
  @IsUUID("loose", { each: true })
  addedById?: string[];

  @ApiPropertyOptional({
    type: String,
    format: "date-time",
    description:
      "Inclusive lower bound on Photo.createdAt (when the photo was uploaded to Everglow, not camera " +
      "capture time). Clients usually send the start of the first selected calendar day.",
  })
  @IsOptional()
  @IsDateString()
  createdAfter?: string;

  @ApiPropertyOptional({
    type: String,
    format: "date-time",
    description:
      "Inclusive upper bound on Photo.createdAt (upload time). Clients usually send the end of the last " +
      "selected calendar day.",
  })
  @IsOptional()
  @IsDateString()
  createdBefore?: string;

  @ApiPropertyOptional({
    enum: AccessLevel,
    enumName: "AccessLevel",
    isArray: true,
    description:
      "Only photos whose uploader currently has one of these roles on the event (OR). Photos with no " +
      "uploader (deleted account) or no remaining membership are excluded. Omit for any role.",
  })
  @IsOptional()
  @Transform(toOptionalStringArray)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsEnum(AccessLevel, { each: true })
  addedByRole?: AccessLevel[];
}
