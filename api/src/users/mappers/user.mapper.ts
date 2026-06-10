import { UserResponseDto } from "../dto/user-response.dto";
import { UserWithDetails } from "../users.types";

export class UserMapper {
  static toResponseDto(user: UserWithDetails): UserResponseDto {
    return {
      id: user.id,
      isOnboarded: !!user.details,
      details: user.details
        ? {
            email: user.details.email,
            name: user.details.name,
            createdAt: user.details.createdAt,
            updatedAt: user.details.updatedAt,
          }
        : null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
