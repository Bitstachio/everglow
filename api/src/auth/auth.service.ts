import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserAuth } from "../users/entities/user-auth.entity";
import { User } from "../users/entities/user.entity";
import { AuthResponseDto, JwtPayloadDto, RefreshDto, SigninDto, SignupDto } from "./dto";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserAuth)
    private readonly userAuthRepository: Repository<UserAuth>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async signup(signupDto: SignupDto): Promise<AuthResponseDto> {
    const { name, email, password } = signupDto;

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException("Email already registered");
    }

    // Create new user
    const user = this.userRepository.create({ name, email });
    const savedUser = await this.userRepository.save(user);

    // Create user auth record
    const userAuth = this.userAuthRepository.create({
      userId: savedUser.id,
      passwordHash: password,
    });
    await this.userAuthRepository.save(userAuth);

    // Generate tokens
    const tokens = this.generateTokens(savedUser.id, savedUser.email);

    // Store refresh token
    await this.userAuthRepository.update({ userId: savedUser.id }, { refreshToken: tokens.refreshToken });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: savedUser.id,
        email: savedUser.email,
        name: savedUser.name,
      },
    };
  }

  async signin(signinDto: SigninDto): Promise<AuthResponseDto> {
    const { email, password } = signinDto;

    // Find user
    const user = await this.userRepository.findOne({
      where: { email },
      relations: ["auth"],
    });
    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }

    // Verify password
    const isPasswordValid = await user.auth.comparePassword(password);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    // Generate tokens
    const tokens = this.generateTokens(user.id, user.email);

    // Store refresh token
    await this.userAuthRepository.update({ userId: user.id }, { refreshToken: tokens.refreshToken });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  async refreshAccessToken(refreshDto: RefreshDto): Promise<{ accessToken: string }> {
    const { refreshToken } = refreshDto;

    if (!refreshToken) {
      throw new BadRequestException("Refresh token is required");
    }

    try {
      // Verify refresh token
      const payload = this.jwtService.verify<JwtPayloadDto>(refreshToken, {
        secret: this.configService.get<string>("jwt.refreshSecret"),
      });

      // Verify token exists in database
      const userAuth = await this.userAuthRepository.findOne({
        where: { userId: payload.sub, refreshToken },
      });
      if (!userAuth) {
        throw new UnauthorizedException("Invalid refresh token");
      }

      // Generate new access token
      const accessToken = this.jwtService.sign(
        { sub: payload.sub, email: payload.email },
        {
          secret: this.configService.get<string>("jwt.secret"),
          expiresIn: this.configService.get<string>("jwt.accessExpiration") || "15m",
        },
      );

      return { accessToken };
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  async logout(userId: string): Promise<void> {
    await this.userAuthRepository.update({ userId }, { refreshToken: null });
  }

  private generateTokens(userId: string, email: string) {
    const payload: JwtPayloadDto = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>("jwt.secret"),
      expiresIn: this.configService.get<string>("jwt.accessExpiration") || "15m",
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>("jwt.refreshSecret"),
      expiresIn: this.configService.get<string>("jwt.refreshExpiration") || "7d",
    });

    return { accessToken, refreshToken };
  }

  async validateUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    return user;
  }
}
