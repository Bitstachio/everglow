import { ApiProperty } from "@nestjs/swagger";

export class UserResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "user@example.com" })
  email: string;

  @ApiProperty({ example: "Jane Doe" })
  name: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
