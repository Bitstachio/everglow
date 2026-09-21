import { ApiProperty } from "@nestjs/swagger";
import { BlockedUserResponseDto } from "./blocked-user-response.dto";

export class BlockedUserListResponseDto {
  @ApiProperty({ type: [BlockedUserResponseDto] })
  items: BlockedUserResponseDto[];
}
