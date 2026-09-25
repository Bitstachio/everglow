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

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
