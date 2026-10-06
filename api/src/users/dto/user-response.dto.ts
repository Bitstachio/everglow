import { ApiProperty } from "@nestjs/swagger";
import { UserDetailsResponseDto } from "./user-details-response.dto";

export class UserResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  isOnboarded: boolean;

  @ApiProperty({ type: () => UserDetailsResponseDto, nullable: true })
  details: UserDetailsResponseDto | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: "When the user accepted the terms of use; null if they have not been asked yet.",
  })
  termsAcceptedAt: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description:
      "When the platform suspended the account, or null. A suspended account can read and delete itself; every " +
      "other request answers 403 ACCOUNT_SUSPENDED.",
  })
  suspendedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
