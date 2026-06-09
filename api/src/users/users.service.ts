import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserResponseDto } from "./dto/user-response.dto";
import { USER_SERVICE_ERRORS } from "./users.constants";
import { userWithDetailsInclude, UserWithDetails } from "./users.types";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(sub: string, dto: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.prisma.user.create({
      data: {
        providerSub: sub,
        details: {
          create: {
            email: dto.email,
            name: dto.name,
          },
        },
      },
      include: userWithDetailsInclude,
    });

    return this.toResponseDto(user);
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.findOneOrThrow(id);

    return this.toResponseDto(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    await this.findOneOrThrow(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        details: {
          update: dto,
        },
      },
      include: userWithDetailsInclude,
    });

    return this.toResponseDto(user);
  }

  async remove(id: string): Promise<void> {
    await this.findOneOrThrow(id);

    await this.prisma.$transaction([
      this.prisma.userDetails.delete({ where: { userId: id } }),
      this.prisma.user.delete({ where: { id } }),
    ]);
  }

  async resolveByProviderSub(sub: string): Promise<UserWithDetails> {
    const user = await this.prisma.user.findUnique({
      where: { providerSub: sub },
      include: userWithDetailsInclude,
    });

    // TODO: Implement JIT provisioning -> Create authenticated user record in the database on first login
    if (!user) throw new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(sub));

    return user;
  }

  //===== Utilities =====

  private async findOneOrThrow(id: string): Promise<UserWithDetails> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userWithDetailsInclude,
    });

    if (!user?.details) throw new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(id));

    return user;
  }

  private toResponseDto(user: UserWithDetails): UserResponseDto {
    if (!user.details) throw new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(user.id));

    return {
      id: user.id,
      email: user.details.email,
      name: user.details.name,
      createdAt: user.createdAt,
      updatedAt: user.details.updatedAt,
    };
  }
}
