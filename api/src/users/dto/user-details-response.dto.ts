import { ApiProperty } from "@nestjs/swagger";
import { STRING_LIMITS } from "src/common/constants/schema.constants";

export class UserDetailsResponseDto {
  @ApiProperty({ example: "jane.doe", maxLength: STRING_LIMITS.USERNAME })
  username: string;

  @ApiProperty({ example: "Jane Doe" })
  name: string;

  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: STRING_LIMITS.LONG,
    description: "Short-lived presigned URL of the profile avatar; null when none is set",
  })
  avatarUrl: string | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description:
      "When the username can be changed again; null when it can be changed now. Usernames can be changed " +
      "2 times every 14 days, so the app can say when before the user tries.",
  })
  usernameChangeAvailableAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
