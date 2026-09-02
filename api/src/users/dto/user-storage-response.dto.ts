import { ApiProperty } from "@nestjs/swagger";

export class UserStorageResponseDto {
  @ApiProperty({ description: "Bytes currently used by the caller's uploads", example: "2147483648" })
  usedBytes: string;

  @ApiProperty({ description: "Maximum bytes the caller may use", example: "5368709120" })
  limitBytes: string;

  @ApiProperty({ description: "Bytes remaining before the quota is reached", example: "3221225472" })
  remainingBytes: string;
}
