import { ApiProperty } from "@nestjs/swagger";
import { STRING_LIMITS } from "src/common/constants/schema.constants";

export class MultipartPartResponseDto {
  @ApiProperty({ minimum: 1, description: "1-based S3 part number" })
  partNumber: number;

  @ApiProperty({ description: "Exact byte length of this part; the URL rejects any other Content-Length" })
  sizeBytes: number;

  @ApiProperty({ maxLength: STRING_LIMITS.LONG, description: "Presigned S3 PUT URL for this part's bytes" })
  uploadUrl: string;

  @ApiProperty({ description: "True when S3 already holds this part in full; re-uploading it is harmless" })
  uploaded: boolean;
}

export class MultipartUploadResponseDto {
  @ApiProperty({ format: "uuid" })
  photoId: string;

  @ApiProperty({ description: "Declared size of the whole file" })
  sizeBytes: number;

  @ApiProperty({ description: "Every part but the last is exactly this many bytes" })
  partSizeBytes: number;

  @ApiProperty({ description: "When the part URLs expire; fetch the upload state again for fresh ones" })
  expiresAt: Date;

  @ApiProperty({ type: [MultipartPartResponseDto], description: "The full layout, in part order" })
  parts: MultipartPartResponseDto[];
}
