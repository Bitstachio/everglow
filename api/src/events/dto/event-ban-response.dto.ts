import { ApiProperty } from "@nestjs/swagger";

export class EventBanResponseDto {
  @ApiProperty({ format: "uuid", description: "The banned member" })
  userId: string;

  @ApiProperty({ type: String, nullable: true, description: "Null when the account has no profile." })
  name: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Public handle; null when the account has no profile." })
  username: string | null;

  @ApiProperty({ description: "When an organizer removed them" })
  bannedAt: Date;
}
