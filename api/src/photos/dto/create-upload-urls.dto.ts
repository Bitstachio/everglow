import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsInt, Max, Min, ValidateNested } from "class-validator";
import { ALLOWED_PHOTO_CONTENT_TYPES, MAX_PHOTO_SIZE_BYTES, MAX_UPLOAD_BATCH_SIZE } from "../photos.constants";

export class UploadFileDto {
  @IsIn(ALLOWED_PHOTO_CONTENT_TYPES)
  contentType: string;

  @IsInt()
  @Min(1)
  @Max(MAX_PHOTO_SIZE_BYTES)
  sizeBytes: number;
}

export class CreateUploadUrlsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_UPLOAD_BATCH_SIZE)
  @ValidateNested({ each: true })
  @Type(() => UploadFileDto)
  files: UploadFileDto[];
}
