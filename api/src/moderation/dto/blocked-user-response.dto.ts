import { ApiProperty } from "@nestjs/swagger";

export class BlockedUserResponseDto {
  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiProperty({ type: String, nullable: true, description: "Null when the blocked account has no profile." })
  name: string | null;

  @ApiProperty()
  blockedAt: Date;
}
