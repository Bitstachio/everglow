import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { isUniqueConstraintViolation } from "src/prisma/prisma.errors";
import { PrismaService } from "src/prisma/prisma.service";
import { Auth0ManagementService } from "src/sdk/auth0/auth0-management.service";
import { CreateUserDetailsDto } from "./dto/create-user-details.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { USER_SERVICE_ERRORS } from "./users.constants";
import { UserWithDetails, userWithDetailsInclude } from "./users.types";

/** Fields the account-deletion saga needs; callers may pass a lean select. */
export type AccountDeletionUser = Pick<UserWithDetails, "id" | "providerSub" | "deletionStartedAt" | "auth0DeletedAt">;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth0Management: Auth0ManagementService,
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

  async remove(id: string): Promise<void> {
    const user = await this.getById(id);
    await this.completeAccountDeletion(user);
  }

  /**
   * Dual-store account deletion saga (see docs/account-deletion.md).
   * Idempotent: safe for request retries and the account-deletion reconciler.
   *
   * Related-row prep (events, photos, …) is intentionally out of scope here and
   * will land in follow-up work; until then `user.delete` may still fail on RESTRICT FKs.
   */
  async completeAccountDeletion(user: AccountDeletionUser): Promise<void> {
    const { id, providerSub } = user;
    let deletionStartedAt = user.deletionStartedAt;
    let auth0DeletedAt = user.auth0DeletedAt;

    if (!deletionStartedAt) {
      const started = await this.prisma.user.update({
        where: { id },
        data: { deletionStartedAt: new Date() },
        select: { deletionStartedAt: true },
      });
      deletionStartedAt = started.deletionStartedAt;
      this.logger.info(
        { event: "user.account.deletion_started", userId: id, audit: true },
        "Account deletion saga started",
      );
    }

    if (!auth0DeletedAt) {
      // Leave deletionStartedAt set if Auth0 fails so a lost success response
      // cannot drop the durable marker; retries treat Auth0 404 as success.
      await this.auth0Management.deleteUser(providerSub);
      const cleared = await this.prisma.user.update({
        where: { id },
        data: { auth0DeletedAt: new Date() },
        select: { auth0DeletedAt: true },
      });
      auth0DeletedAt = cleared.auth0DeletedAt;
      this.logger.info(
        { event: "user.account.auth0_deleted", userId: id, audit: true },
        "Auth0 identity deleted for account deletion saga",
      );
    }

    // Tombstone before (or with) the hard delete so an in-flight JWT cannot JIT
    // recreate this providerSub. Upsert keeps reconciler retries idempotent.
    await this.prisma.$transaction(async (tx) => {
      await tx.deletedProviderSub.upsert({
        where: { providerSub },
        create: { providerSub, formerUserId: id },
        update: { formerUserId: id },
      });
      await tx.user.delete({ where: { id } });
    });

    this.logger.info(
      {
        event: "user.account.deleted",
        userId: id,
        providerSub,
        deletionStartedAt,
        auth0DeletedAt,
        audit: true,
      },
      "User account deleted",
    );
  }

  /**
   * Resolve the app user for an Auth0 `sub`, JIT-creating on first login.
   * Rejects mid-deletion rows and tombstoned identities (see docs/authentication.md).
   */
  async resolveByProviderSub(sub: string): Promise<UserWithDetails> {
    const existing = await this.prisma.user.findUnique({
      where: { providerSub: sub },
      include: userWithDetailsInclude,
    });

    if (existing) {
      this.assertNotDeleting(existing);
      return existing;
    }

    return this.provisionUnlessTombstoned(sub);
  }

  private assertNotDeleting(user: UserWithDetails): void {
    if (!user.deletionStartedAt) return;

    this.logger.info(
      {
        event: "user.resolve.rejected_deletion_in_progress",
        userId: user.id,
        providerSub: user.providerSub,
        audit: true,
      },
      "Rejected resolve for account with deletion in progress",
    );
    // Generic 401: do not tell the client the account was deleted.
    throw new UnauthorizedException();
  }

  private rejectTombstoned(sub: string): never {
    this.logger.info(
      { event: "user.resolve.rejected_tombstone", providerSub: sub, audit: true },
      "Rejected JIT provisioning for tombstoned providerSub",
    );
    // Generic 401: do not tell the client the account was deleted.
    throw new UnauthorizedException();
  }

  private async provisionUnlessTombstoned(sub: string): Promise<UserWithDetails> {
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const tombstone = await tx.deletedProviderSub.findUnique({
          where: { providerSub: sub },
        });
        if (tombstone) this.rejectTombstoned(sub);

        return tx.user.create({
          data: { providerSub: sub },
          include: userWithDetailsInclude,
        });
      });

      this.logger.info({ event: "user.provisioned", userId: created.id }, "Provisioned new user on first login");
      return created;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;

      // Lost race with another JIT create (or a delete that already tombstoned).
      if (isUniqueConstraintViolation(error)) {
        return this.resolveAfterProvisionRace(sub);
      }

      throw error;
    }
  }

  private async resolveAfterProvisionRace(sub: string): Promise<UserWithDetails> {
    const existing = await this.prisma.user.findUnique({
      where: { providerSub: sub },
      include: userWithDetailsInclude,
    });

    if (existing) {
      this.assertNotDeleting(existing);
      return existing;
    }

    const tombstone = await this.prisma.deletedProviderSub.findUnique({
      where: { providerSub: sub },
    });
    if (tombstone) this.rejectTombstoned(sub);

    // Generic 401: same client-visible outcome as an invalid session.
    throw new UnauthorizedException();
  }

  private async assertEmailIsUnique(email: string, excludeUserId?: string): Promise<void> {
    const taken = await this.prisma.userDetails.count({
      where: { email, NOT: { userId: excludeUserId } },
    });

    if (taken > 0) throw new ConflictException(USER_SERVICE_ERRORS.EMAIL_TAKEN(email));
  }
}
