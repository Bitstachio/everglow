import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { hashProviderSub, isIssuedAfterDeletion } from "./deleted-account";
import { CreateUserDetailsDto } from "./dto/create-user-details.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { USER_SERVICE_ERRORS } from "./users.constants";
import { UserWithDetails, userWithDetailsInclude } from "./users.types";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
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

  /**
   * The account behind a verified token. An unknown subject is normally a
   * first login and gets an account on the spot. It is also exactly what a
   * deleted account looks like to a token issued before the deletion, and
   * provisioning that would bring the account back under a fresh id. The
   * tombstone tells the two apart by the token's issue time: older tokens
   * are refused, and a token from a later sign-in starts a new account, the
   * way a deleted messaging account can register again.
   */
  async resolveByProviderSub(sub: string, issuedAt?: number): Promise<UserWithDetails> {
    const existing = await this.prisma.user.findUnique({
      where: { providerSub: sub },
      include: userWithDetailsInclude,
    });

    if (existing) return existing;

    const tombstone = await this.prisma.deletedAccount.findUnique({ where: { providerSubHash: hashProviderSub(sub) } });
    if (tombstone && !isIssuedAfterDeletion(issuedAt, tombstone.deletedAt)) {
      throw new UnauthorizedException(USER_SERVICE_ERRORS.ACCOUNT_DELETED);
    }

    // JIT provisioning: create user record on first-ever login.
    const created = await this.prisma.user.create({
      data: { providerSub: sub },
      include: userWithDetailsInclude,
    });

    this.logger.info({ event: "user.provisioned", userId: created.id }, "Provisioned new user on first login");

    return created;
  }

  private async assertEmailIsUnique(email: string, excludeUserId?: string): Promise<void> {
    const taken = await this.prisma.userDetails.count({
      where: { email, NOT: { userId: excludeUserId } },
    });

    if (taken > 0) throw new ConflictException(USER_SERVICE_ERRORS.EMAIL_TAKEN(email));
  }
}
