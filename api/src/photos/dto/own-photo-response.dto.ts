import { ApiProperty } from "@nestjs/swagger";
import { STRING_LIMITS } from "src/common/constants/schema.constants";
import { ALLOWED_PHOTO_CONTENT_TYPES } from "../photos.constants";

export class OwnPhotoResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ maxLength: STRING_LIMITS.LONG, description: "Presigned S3 GET URL, valid for a short period" })
  url: string;

  @ApiProperty({ enum: ALLOWED_PHOTO_CONTENT_TYPES, example: "image/jpeg" })
  contentType: string;

  @ApiProperty({ description: "Bytes this photo uses", example: 2457600 })
  sizeBytes: number;

  @ApiProperty()
  createdAt: Date;
}
