import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateUserDetailsDto } from "./dto/create-user-details.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { USER_SERVICE_ERRORS } from "./users.constants";
import { UserWithDetails, userWithDetailsInclude } from "./users.types";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createDetails(id: string, dto: CreateUserDetailsDto): Promise<UserWithDetails> {
    const user = await this.findOne(id);

    if (user.details) throw new ConflictException(USER_SERVICE_ERRORS.DETAILS_ALREADY_EXIST(id));

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        details: {
          create: {
            email: dto.email,
            name: dto.name,
          },
        },
      },
      include: userWithDetailsInclude,
    });

    return updated;
  }

  async findOne(id: string): Promise<UserWithDetails> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userWithDetailsInclude,
    });

    if (!user) throw new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(id));

    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserWithDetails> {
    const user = await this.findOne(id);

    if (!user.details) throw new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(id));

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        details: {
          update: dto,
        },
      },
      include: userWithDetailsInclude,
    });

    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    await this.prisma.user.delete({ where: { id } });
  }

  resolveByProviderSub(sub: string): Promise<UserWithDetails> {
    return this.prisma.user.upsert({
      where: { providerSub: sub },
      create: { providerSub: sub },
      update: {},
      include: userWithDetailsInclude,
    });
  }
}
