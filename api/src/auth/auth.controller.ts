import { Body, Controller, HttpCode, HttpStatus, Post, Request, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { Request as ExpressRequest } from "express";
import { ApiWrappedResponse } from "../common/swagger/api-wrapped-response.decorator";
import { AuthService } from "./auth.service";
import { AccessTokenResponseDto, AuthResponseDto, LogoutResponseDto, RefreshDto, SigninDto, SignupDto } from "./dto";
import { JwtPayloadDto } from "./dto/jwt-payload.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

type AuthenticatedRequest = ExpressRequest & { user: JwtPayloadDto };

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("signup")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Register a new user" })
  @ApiWrappedResponse(AuthResponseDto, "Signup successful", 201)
  async signup(@Body() signupDto: SignupDto): Promise<AuthResponseDto> {
    return this.authService.signup(signupDto);
  }

  @Post("signin")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Sign in with email and password" })
  @ApiWrappedResponse(AuthResponseDto, "Sign-in successful")
  async signin(@Body() signinDto: SigninDto): Promise<AuthResponseDto> {
    return this.authService.signin(signinDto);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Refresh access token using a refresh token" })
  @ApiWrappedResponse(AccessTokenResponseDto, "New access token issued")
  async refresh(@Body() refreshDto: RefreshDto): Promise<AccessTokenResponseDto> {
    return this.authService.refreshAccessToken(refreshDto);
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Log out and invalidate refresh token" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
  @ApiWrappedResponse(LogoutResponseDto, "Logged out")
  async logout(@Request() req: AuthenticatedRequest): Promise<LogoutResponseDto> {
    await this.authService.logout(req.user.sub);
    return {
      success: true,
      message: "Logged out successfully",
    };
  }
}
