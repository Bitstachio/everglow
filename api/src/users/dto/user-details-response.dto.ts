import { ApiProperty } from "@nestjs/swagger";

export class UserDetailsResponseDto {
  @ApiProperty({ example: "user@example.com" })
  email: string;

  @ApiProperty({ example: "Jane Doe" })
  name: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
