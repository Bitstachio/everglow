import { ApiProperty } from "@nestjs/swagger";
import { STRING_LIMITS } from "src/common/constants/schema.constants";

export class GalleryResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  eventId: string;

  @ApiProperty({ maxLength: STRING_LIMITS.TITLE })
  name: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
