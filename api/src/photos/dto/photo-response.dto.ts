import { ApiProperty } from "@nestjs/swagger";
import { STRING_LIMITS } from "src/common/constants/schema.constants";
import { ALLOWED_PHOTO_CONTENT_TYPES } from "../photos.constants";

export class PhotoResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  eventId: string;

  @ApiProperty({ format: "uuid" })
  addedById: string;

  @ApiProperty({ maxLength: STRING_LIMITS.LONG, description: "Presigned S3 GET URL, valid for a short period" })
  url: string;

  @ApiProperty({ enum: ALLOWED_PHOTO_CONTENT_TYPES, example: "image/jpeg" })
  contentType: string;

  @ApiProperty()
  createdAt: Date;
}
