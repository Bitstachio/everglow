import { ApiProperty } from "@nestjs/swagger";
import { EventBanResponseDto } from "./event-ban-response.dto";

export class EventBanListResponseDto {
  @ApiProperty({ type: [EventBanResponseDto], description: "Newest first" })
  items: EventBanResponseDto[];
}
