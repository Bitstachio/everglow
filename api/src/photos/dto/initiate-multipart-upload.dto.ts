import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsInt, Max, Min } from "class-validator";
import { ALLOWED_PHOTO_CONTENT_TYPES, MAX_PHOTO_SIZE_BYTES, MULTIPART_MIN_SIZE_BYTES } from "../photos.constants";

export class InitiateMultipartUploadDto {
  @ApiProperty({ enum: ALLOWED_PHOTO_CONTENT_TYPES, example: "image/jpeg" })
  @IsIn(ALLOWED_PHOTO_CONTENT_TYPES)
  contentType: string;

  @ApiProperty({
    minimum: MULTIPART_MIN_SIZE_BYTES,
    maximum: MAX_PHOTO_SIZE_BYTES,
    example: 12 * 1024 * 1024,
    description: "Exact size of the file. Files below the minimum use the single-PUT upload-urls flow instead.",
  })
  @IsInt()
  @Min(MULTIPART_MIN_SIZE_BYTES)
  @Max(MAX_PHOTO_SIZE_BYTES)
  sizeBytes: number;
}
