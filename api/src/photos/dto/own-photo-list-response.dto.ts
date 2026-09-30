import { ApiProperty } from "@nestjs/swagger";
import { OwnPhotoResponseDto } from "./own-photo-response.dto";

export class OwnPhotoListResponseDto {
  @ApiProperty({ type: [OwnPhotoResponseDto], description: "Newest first" })
  items: OwnPhotoResponseDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Opaque cursor for the next page; pass it as ?cursor=. Null on the last page.",
  })
  nextCursor: string | null;
}
