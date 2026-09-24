import { ApiProperty } from "@nestjs/swagger";
import { STRING_LIMITS } from "src/common/constants/schema.constants";

export class ImageUploadResponseDto {
  @ApiProperty({ format: "uuid", description: "Pass it back to confirm the upload" })
  uploadId: string;

  @ApiProperty({ maxLength: STRING_LIMITS.LONG, description: "Presigned S3 PUT URL the client uploads bytes to" })
  uploadUrl: string;

  @ApiProperty({ description: "When uploadUrl stops being accepted; request a new one after this" })
  expiresAt: Date;
}
