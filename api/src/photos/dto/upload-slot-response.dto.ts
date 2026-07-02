import { ApiProperty } from "@nestjs/swagger";
import { STRING_LIMITS } from "src/common/constants/schema.constants";

export class UploadSlotResponseDto {
  @ApiProperty({ format: "uuid" })
  photoId: string;

  @ApiProperty({ maxLength: STRING_LIMITS.LONG, description: "Presigned S3 PUT URL the client uploads bytes to" })
  uploadUrl: string;
}
