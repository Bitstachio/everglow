import { ApiProperty } from "@nestjs/swagger";

export class AuthUserDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "user@example.com" })
  email: string;

  @ApiProperty({ example: "Jane Doe" })
  name: string;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;
}

export class AccessTokenResponseDto {
  @ApiProperty()
  accessToken: string;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: "Logged out successfully" })
  message: string;
}
