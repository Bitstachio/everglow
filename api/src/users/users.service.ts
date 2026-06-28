import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { CreateUserDetailsDto } from "./dto/create-user-details.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { USER_AVATAR_CONSTANTS, USER_SERVICE_ERRORS } from "./users.constants";
import { UserWithDetails, userWithDetailsInclude } from "./users.types";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UsersService.name);
  }

  async createDetails(id: string, dto: CreateUserDetailsDto): Promise<UserWithDetails> {
    const user = await this.getById(id);

    if (user.details) throw new ConflictException(USER_SERVICE_ERRORS.DETAILS_ALREADY_EXIST(id));

    await this.assertEmailIsUnique(dto.email);

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

    this.logger.info({ event: "user.onboarding.completed", userId: id }, "User completed onboarding");

    return updated;
  }

  async getById(id: string): Promise<UserWithDetails> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userWithDetailsInclude,
    });

    if (!user) throw new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(id));

    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserWithDetails> {
    const user = await this.getById(id);

    if (!user.details) throw new UnprocessableEntityException(USER_SERVICE_ERRORS.ONBOARDING_INCOMPLETE);
    if (dto.email) await this.assertEmailIsUnique(dto.email, id);

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        details: {
          update: dto,
        },
      },
      include: userWithDetailsInclude,
    });

    this.logger.info({ event: "user.profile.updated", userId: id, fields: Object.keys(dto) }, "User profile updated");

    return updated;
  }

  async uploadAvatar(id: string, file: Express.Multer.File): Promise<UserWithDetails> {
    const user = await this.getById(id);

    if (!user.details) throw new UnprocessableEntityException(USER_SERVICE_ERRORS.ONBOARDING_INCOMPLETE);
    if (!file) throw new BadRequestException(USER_SERVICE_ERRORS.AVATAR_FILE_REQUIRED);

    this.assertValidAvatarFile(file);

    const avatarKey = USER_AVATAR_CONSTANTS.keyForUser(id);

    await this.s3.putObject({
      key: avatarKey,
      body: file.buffer,
      contentType: file.mimetype,
    });

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        details: {
          update: { avatarKey },
        },
      },
      include: userWithDetailsInclude,
    });

    this.logger.info({ event: "user.avatar.uploaded", userId: id }, "User avatar uploaded");

    return updated;
  }

  async deleteAvatar(id: string): Promise<UserWithDetails> {
    const user = await this.getById(id);

    if (!user.details) throw new UnprocessableEntityException(USER_SERVICE_ERRORS.ONBOARDING_INCOMPLETE);
    if (!user.details.avatarKey) throw new NotFoundException(USER_SERVICE_ERRORS.AVATAR_NOT_SET);

    await this.s3.deleteObject(user.details.avatarKey);

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        details: {
          update: { avatarKey: null },
        },
      },
      include: userWithDetailsInclude,
    });

    this.logger.info({ event: "user.avatar.deleted", userId: id }, "User avatar deleted");

    return updated;
  }

  async remove(id: string): Promise<void> {
    const user = await this.getById(id);

    if (user.details?.avatarKey) {
      await this.s3.deleteObject(user.details.avatarKey);
    }

    await this.prisma.user.delete({ where: { id } });

    this.logger.info({ event: "user.account.deleted", userId: id, audit: true }, "User account deleted");
  }

  async resolveByProviderSub(sub: string): Promise<UserWithDetails> {
    const existing = await this.prisma.user.findUnique({
      where: { providerSub: sub },
      include: userWithDetailsInclude,
    });

    if (existing) return existing;

    // JIT provisioning: create user record on first-ever login.
    const created = await this.prisma.user.create({
      data: { providerSub: sub },
      include: userWithDetailsInclude,
    });

    this.logger.info({ event: "user.provisioned", userId: created.id }, "Provisioned new user on first login");

    return created;
  }

  private assertValidAvatarFile(file: Express.Multer.File): void {
    if (!USER_AVATAR_CONSTANTS.ALLOWED_MIME_TYPES.includes(file.mimetype as (typeof USER_AVATAR_CONSTANTS.ALLOWED_MIME_TYPES)[number])) {
      throw new BadRequestException(USER_SERVICE_ERRORS.AVATAR_INVALID_TYPE);
    }

    if (file.size > USER_AVATAR_CONSTANTS.MAX_SIZE_BYTES) {
      throw new BadRequestException(USER_SERVICE_ERRORS.AVATAR_TOO_LARGE);
    }
  }

  private async assertEmailIsUnique(email: string, excludeUserId?: string): Promise<void> {
    const taken = await this.prisma.userDetails.count({
      where: { email, NOT: { userId: excludeUserId } },
    });

    if (taken > 0) throw new ConflictException(USER_SERVICE_ERRORS.EMAIL_TAKEN(email));
  }
}
