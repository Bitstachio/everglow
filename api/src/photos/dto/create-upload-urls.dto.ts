import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsInt, Max, Min, ValidateNested } from "class-validator";
import { ALLOWED_PHOTO_CONTENT_TYPES, MAX_PHOTO_SIZE_BYTES, MAX_UPLOAD_BATCH_SIZE } from "../photos.constants";

export class UploadFileDto {
  @ApiProperty({ enum: ALLOWED_PHOTO_CONTENT_TYPES, example: "image/jpeg" })
  @IsIn(ALLOWED_PHOTO_CONTENT_TYPES)
  contentType: string;

  @ApiProperty({ minimum: 1, maximum: MAX_PHOTO_SIZE_BYTES, example: 1048576 })
  @IsInt()
  @Min(1)
  @Max(MAX_PHOTO_SIZE_BYTES)
  sizeBytes: number;
}

export class CreateUploadUrlsDto {
  @ApiProperty({ type: [UploadFileDto], maxItems: MAX_UPLOAD_BATCH_SIZE })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_UPLOAD_BATCH_SIZE)
  @ValidateNested({ each: true })
  @Type(() => UploadFileDto)
  files: UploadFileDto[];
}
