import { ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsOptional, IsUUID } from "class-validator";
import { MAX_OWN_PHOTOS_DELETE_BATCH } from "../photos.constants";

export class DeleteOwnPhotosDto {
  @ApiPropertyOptional({
    type: [String],
    format: "uuid",
    maxItems: MAX_OWN_PHOTOS_DELETE_BATCH,
    description:
      "The photos to delete. Omit it to delete all of your photos in the event. Ids that are not your photos " +
      "in this event are ignored.",
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_OWN_PHOTOS_DELETE_BATCH)
  @IsUUID(undefined, { each: true })
  photoIds?: string[];
}
