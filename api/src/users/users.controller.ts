import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import type { AuthenticatedUser } from "src/auth/auth.types";
import { CurrentUser } from "src/auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ApiWrappedResponse } from "../common/swagger/api-wrapped-response.decorator";
import { CreateUserDetailsDto } from "./dto/create-user-details.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserResponseDto } from "./dto/user-response.dto";
import { UserStorageResponseDto } from "./dto/user-storage-response.dto";
import { UserMapper } from "./mappers/user.mapper";
import { UsersService } from "./users.service";
import { PhotoStorageService } from "src/photos/photo-storage.service";

@ApiTags("users")
@ApiBearerAuth("access-token")
@Controller("users")
@UseGuards(JwtAuthGuard)
@ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly photoStorageService: PhotoStorageService,
  ) {}

  @Post("me/onboarding")
  @ApiOperation({ summary: "Complete user onboarding" })
  @ApiWrappedResponse(UserResponseDto, "Onboarded user profile", 201)
  async completeOnboarding(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUserDetailsDto,
  ): Promise<UserResponseDto> {
    return UserMapper.toResponseDto(await this.usersService.createDetails(user.id, dto));
  }

  @Get("me")
  @ApiOperation({ summary: "Get current user" })
  @ApiWrappedResponse(UserResponseDto, "User profile")
  async findMe(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return UserMapper.toResponseDto(await this.usersService.getById(user.id));
  }

  @Get("me/storage")
  @ApiOperation({ summary: "Get current user photo storage quota" })
  @ApiWrappedResponse(UserStorageResponseDto, "Photo storage usage")
  async getMyStorage(@CurrentUser() user: AuthenticatedUser): Promise<UserStorageResponseDto> {
    return this.photoStorageService.getStorageForUser(user.id);
  }

  @Patch("me")
  @ApiOperation({ summary: "Update current user" })
  @ApiWrappedResponse(UserResponseDto, "Updated user profile")
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return UserMapper.toResponseDto(await this.usersService.update(user.id, updateUserDto));
  }

  @Delete("me")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete current user" })
  @ApiNoContentResponse({ description: "User deleted (empty data envelope at runtime)" })
  async removeMe(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.usersService.remove(user.id);
  }
}
