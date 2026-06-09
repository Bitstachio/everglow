import { Injectable, NotFoundException } from "@nestjs/common";
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

  create(sub: string, dto: CreateUserDto): Promise<UserResponseDto> {
    return this.prisma.user.create({ data: { providerSub: sub, ...dto } });
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) throw new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(id));

    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    await this.findOne(id);

    return this.prisma.user.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
  }

  async resolveByProviderSub(sub: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { providerSub: sub } });

    // TODO: Implement JIT provisioning -> Create authenticated user record in the database on first login
    if (!user) throw new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(sub));

    return user;
  }
}
