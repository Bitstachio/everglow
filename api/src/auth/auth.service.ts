import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { UserResponseDto } from "../users/dto/user-response.dto";
import { AuthResponseDto, RefreshDto, SigninDto, SignupDto } from "./dto";

const DB_UNAVAILABLE = "Database unavailable — Prisma migration in progress";

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  signup(signupDto: SignupDto): Promise<AuthResponseDto> {
    void signupDto;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }

  signin(signinDto: SigninDto): Promise<AuthResponseDto> {
    void signinDto;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }

  refreshAccessToken(refreshDto: RefreshDto): Promise<{ accessToken: string }> {
    void refreshDto;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }

  logout(userId: string): Promise<void> {
    void userId;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }

  // Token helpers — restore when Prisma auth flow is implemented.
  // private generateTokens(userId: string, email: string) { ... }

  validateUser(userId: string): Promise<UserResponseDto> {
    void userId;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }
}
