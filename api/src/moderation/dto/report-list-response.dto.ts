import { ApiProperty } from "@nestjs/swagger";
import { ReportResponseDto } from "./report-response.dto";

export class ReportListResponseDto {
  @ApiProperty({ type: [ReportResponseDto] })
  items: ReportResponseDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Opaque cursor for the next page; pass it as ?cursor=. Null on the last page.",
  })
  nextCursor: string | null;
}
