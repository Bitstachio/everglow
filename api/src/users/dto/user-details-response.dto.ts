import { ApiProperty } from "@nestjs/swagger";
import { STRING_LIMITS } from "src/common/constants/schema.constants";

export class UserDetailsResponseDto {
  @ApiProperty({ example: "jane.doe", maxLength: STRING_LIMITS.USERNAME })
  username: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "user@example.com",
    description: "Optional profile email while it remains on the row; null when unset. Being removed in EV-21 phase 3.",
  })
  email: string | null;

  @ApiProperty({ example: "Jane Doe" })
  name: string;

  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: STRING_LIMITS.LONG,
    description: "Short-lived presigned URL of the profile avatar; null when none is set",
  })
  avatarUrl: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
