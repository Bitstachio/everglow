import { UserResponseDto } from "../dto/user-response.dto";
import { UserWithDetails } from "../users.types";

export class UserMapper {
  static toResponseDto(user: UserWithDetails, avatarUrl: string | null): UserResponseDto {
    return {
      id: user.id,
      isOnboarded: !!user.details,
      details: user.details
        ? {
            username: user.details.username,
            name: user.details.name,
            avatarUrl,
            createdAt: user.details.createdAt,
            updatedAt: user.details.updatedAt,
          }
        : null,
      termsAcceptedAt: user.termsAcceptedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
