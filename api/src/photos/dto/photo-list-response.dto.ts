import { ApiProperty } from "@nestjs/swagger";
import { PhotoResponseDto } from "./photo-response.dto";

export class PhotoListResponseDto {
  @ApiProperty({ type: [PhotoResponseDto] })
  items: PhotoResponseDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Opaque cursor for the next page; pass it as ?cursor=. Null on the last page.",
  })
  nextCursor: string | null;
}
