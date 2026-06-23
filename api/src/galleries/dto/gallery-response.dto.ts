import { ApiProperty } from "@nestjs/swagger";

export class GalleryResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  eventId: string;

  @ApiProperty({ maxLength: 100 })
  name: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
