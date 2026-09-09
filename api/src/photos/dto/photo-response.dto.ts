import { ApiProperty } from "@nestjs/swagger";
import { STRING_LIMITS } from "src/common/constants/schema.constants";
import { ALLOWED_PHOTO_CONTENT_TYPES } from "../photos.constants";

export class PhotoResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  eventId: string;

  @ApiProperty({
    format: "uuid",
    nullable: true,
    type: String,
    description:
      "Who uploaded the photo; null once that account has been deleted and the photo was kept for the event.",
  })
  addedById: string | null;

  @ApiProperty({ maxLength: STRING_LIMITS.LONG, description: "Presigned S3 GET URL, valid for a short period" })
  url: string;

  @ApiProperty({ enum: ALLOWED_PHOTO_CONTENT_TYPES, example: "image/jpeg" })
  contentType: string;

  @ApiProperty()
  createdAt: Date;
}
