import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { STRING_LIMITS } from "src/common/constants/schema.constants";

export class JoinEventDto {
  @ApiProperty({
    description: "Full invitation URL or invite token",
    example: "https://events.everglow.app/invite/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(STRING_LIMITS.STANDARD)
  invitationUrl: string;
}
