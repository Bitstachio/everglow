import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsInt, Max, Min } from "class-validator";
import { ALLOWED_IMAGE_CONTENT_TYPES, MAX_IMAGE_SIZE_BYTES } from "../images.constants";

export class CreateImageUploadDto {
  @ApiProperty({ enum: ALLOWED_IMAGE_CONTENT_TYPES, example: "image/jpeg" })
  @IsIn(ALLOWED_IMAGE_CONTENT_TYPES)
  contentType: string;

  @ApiProperty({ minimum: 1, maximum: MAX_IMAGE_SIZE_BYTES, example: 262144 })
  @IsInt()
  @Min(1)
  @Max(MAX_IMAGE_SIZE_BYTES)
  sizeBytes: number;
}
