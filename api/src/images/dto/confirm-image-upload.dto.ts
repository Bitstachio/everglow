import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class ConfirmImageUploadDto {
  @ApiProperty({ format: "uuid", description: "The uploadId returned when the upload URL was minted" })
  @IsUUID()
  uploadId: string;
}
