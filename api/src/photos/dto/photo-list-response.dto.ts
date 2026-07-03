import { ApiProperty } from "@nestjs/swagger";
import { PhotoResponseDto } from "./photo-response.dto";

export class PhotoListResponseDto {
  @ApiProperty({ type: [PhotoResponseDto] })
  items: PhotoResponseDto[];

  @ApiProperty({ format: "uuid", nullable: true, description: "Pass as ?cursor= to fetch the next page" })
  nextCursor: string | null;
}
