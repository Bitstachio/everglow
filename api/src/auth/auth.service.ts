import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { UserResponseDto } from "../users/dto/user-response.dto";

const DB_UNAVAILABLE = "Database unavailable — Prisma migration in progress";

@Injectable()
export class AuthService {
  // TODO: Determine if I need this method
  validateUser(userId: string): Promise<UserResponseDto> {
    void userId;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }
}
