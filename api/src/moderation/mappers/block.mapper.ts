import { BlockedUserListResponseDto } from "../dto/blocked-user-list-response.dto";
import { BlockedUserResponseDto } from "../dto/blocked-user-response.dto";
import { BlockWithBlockedUser } from "../moderation.types";

export class BlockMapper {
  static toResponseDto(block: BlockWithBlockedUser): BlockedUserResponseDto {
    return {
      userId: block.blockedId,
      name: block.blocked.details?.name ?? null,
      blockedAt: block.createdAt,
    };
  }

  static toListResponseDto(blocks: BlockWithBlockedUser[]): BlockedUserListResponseDto {
    return { items: blocks.map((block) => BlockMapper.toResponseDto(block)) };
  }
}
