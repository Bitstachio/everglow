import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { User } from "generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserResponseDto } from "./dto/user-response.dto";
import { USER_SERVICE_ERRORS } from "./users.constants";

const DB_UNAVAILABLE = "Database unavailable — Prisma migration in progress";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  createWithManager(manager: unknown, data: CreateUserDto): Promise<UserResponseDto> {
    void manager;
    void data;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) throw new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(id));

    return user;
  }

  update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    void id;
    void updateUserDto;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }

  remove(id: string): Promise<void> {
    void id;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }

  async resolveByProviderSub(sub: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { providerSub: sub } });

    // TODO: Implement JIT provisioning -> Create authenticated user record in the database on first login
    if (!user) throw new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(sub));

    return user;
  }
}
