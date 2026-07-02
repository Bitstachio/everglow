import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from "class-validator";
import { MAX_UPLOAD_BATCH_SIZE } from "../photos.constants";

export class ConfirmUploadsDto {
  @ApiProperty({ type: [String], format: "uuid", maxItems: MAX_UPLOAD_BATCH_SIZE })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_UPLOAD_BATCH_SIZE)
  @IsUUID(undefined, { each: true })
  photoIds: string[];
}
