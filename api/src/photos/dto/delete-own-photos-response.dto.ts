import { ApiProperty } from "@nestjs/swagger";

export class DeleteOwnPhotosResponseDto {
  @ApiProperty({ description: "Photos actually deleted" })
  photosDeleted: number;

  @ApiProperty({ description: "Bytes returned to the caller's storage", example: "671088640" })
  bytesFreed: string;
}
