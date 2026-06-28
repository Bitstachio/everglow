import { UserResponseDto } from "../dto/user-response.dto";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { UserWithDetails } from "../users.types";

export class UserMapper {
  static async toResponseDto(user: UserWithDetails, s3: S3Service): Promise<UserResponseDto> {
    const avatarUrl =
      user.details?.avatarKey != null
        ? await s3.getPresignedDownloadUrl({ key: user.details.avatarKey })
        : null;

    return {
      id: user.id,
      isOnboarded: !!user.details,
      details: user.details
        ? {
            email: user.details.email,
            name: user.details.name,
            avatarUrl,
            createdAt: user.details.createdAt,
            updatedAt: user.details.updatedAt,
          }
        : null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
