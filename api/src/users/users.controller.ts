import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { AuthenticatedUser } from "src/auth/auth.types";
import { CurrentUser } from "src/auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ApiWrappedResponse } from "../common/swagger/api-wrapped-response.decorator";
import { S3Service } from "../sdk/aws/s3/s3.service";
import { CreateUserDetailsDto } from "./dto/create-user-details.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserResponseDto } from "./dto/user-response.dto";
import { UserMapper } from "./mappers/user.mapper";
import { UsersService } from "./users.service";

@ApiTags("users")
@ApiBearerAuth("access-token")
@Controller("users")
@UseGuards(JwtAuthGuard)
@ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly s3: S3Service,
  ) {}

  @Post("me/onboarding")
  @ApiOperation({ summary: "Complete user onboarding" })
  @ApiWrappedResponse(UserResponseDto, "Onboarded user profile", 201)
  async completeOnboarding(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUserDetailsDto,
  ): Promise<UserResponseDto> {
    return UserMapper.toResponseDto(await this.usersService.createDetails(user.id, dto), this.s3);
  }

  @Get("me")
  @ApiOperation({ summary: "Get current user" })
  @ApiWrappedResponse(UserResponseDto, "User profile")
  async findMe(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return UserMapper.toResponseDto(await this.usersService.getById(user.id), this.s3);
  }

  @Patch("me")
  @ApiOperation({ summary: "Update current user" })
  @ApiWrappedResponse(UserResponseDto, "Updated user profile")
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return UserMapper.toResponseDto(await this.usersService.update(user.id, updateUserDto), this.s3);
  }

  @Post("me/avatar")
  @ApiOperation({ summary: "Upload current user avatar" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        avatar: { type: "string", format: "binary" },
      },
      required: ["avatar"],
    },
  })
  @ApiWrappedResponse(UserResponseDto, "Updated user profile with avatar")
  @UseInterceptors(FileInterceptor("avatar"))
  async uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UserResponseDto> {
    return UserMapper.toResponseDto(await this.usersService.uploadAvatar(user.id, file), this.s3);
  }

  @Delete("me/avatar")
  @ApiOperation({ summary: "Delete current user avatar" })
  @ApiWrappedResponse(UserResponseDto, "Updated user profile without avatar")
  async deleteAvatar(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return UserMapper.toResponseDto(await this.usersService.deleteAvatar(user.id), this.s3);
  }

  @Delete("me")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete current user" })
  @ApiNoContentResponse({ description: "User deleted (empty data envelope at runtime)" })
  async removeMe(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.usersService.remove(user.id);
  }
}
