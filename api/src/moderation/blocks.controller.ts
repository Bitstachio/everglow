import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import type { AuthenticatedUser } from "src/auth/auth.types";
import { CurrentUser } from "src/auth/current-user.decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { ApiWrappedResponse } from "src/common/swagger/api-wrapped-response.decorator";
import { BlocksService } from "./blocks.service";
import { BlockedUserListResponseDto } from "./dto/blocked-user-list-response.dto";
import { BlockedUserResponseDto } from "./dto/blocked-user-response.dto";
import { BlockMapper } from "./mappers/block.mapper";

@ApiTags("moderation")
@ApiBearerAuth("access-token")
@Controller("users/me/blocks")
@UseGuards(JwtAuthGuard)
@ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
export class BlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  @Get()
  @ApiOperation({ summary: "List the users the caller has blocked" })
  @ApiWrappedResponse(BlockedUserListResponseDto, "Blocked users, most recent first")
  async list(@CurrentUser() user: AuthenticatedUser): Promise<BlockedUserListResponseDto> {
    return BlockMapper.toListResponseDto(await this.blocksService.listBlockedUsers(user.id));
  }

  @Put(":userId")
  @ApiOperation({
    summary: "Block a user",
    description:
      "Only someone the caller shares an event with; anyone else is a 404. Silent: the blocked user is never told. " +
      "Idempotent: blocking an already blocked user returns the existing block.",
  })
  @ApiWrappedResponse(BlockedUserResponseDto, "The blocked user")
  async block(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId", ParseUUIDPipe) userId: string,
  ): Promise<BlockedUserResponseDto> {
    return BlockMapper.toResponseDto(await this.blocksService.blockUser(user.id, userId));
  }

  @Delete(":userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Unblock a user" })
  @ApiNoContentResponse({ description: "User is not blocked any more (empty data envelope at runtime)" })
  async unblock(@CurrentUser() user: AuthenticatedUser, @Param("userId", ParseUUIDPipe) userId: string): Promise<void> {
    return this.blocksService.unblockUser(user.id, userId);
  }
}
