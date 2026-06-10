import { ApiProperty } from "@nestjs/swagger";
import { UserDetailsResponseDto } from "./user-details-response.dto";

export class UserResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  isOnboarded: boolean;

  @ApiProperty()
  details: UserDetailsResponseDto | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
