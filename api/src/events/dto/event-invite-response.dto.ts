import { ApiProperty } from "@nestjs/swagger";
import { AccessLevel } from "generated/prisma/client";

export class EventInviteResponseDto {
  @ApiProperty({ enum: AccessLevel, enumName: "AccessLevel" })
  accessLevel: AccessLevel;

  @ApiProperty({ description: "Shareable invitation link for this access level" })
  invitationUrl: string;
}
