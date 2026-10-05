import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { AccountDeletionPhotoPolicy, Prisma } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";
import { ApiException } from "src/common/errors/api.exception";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { isUniqueConstraintViolation } from "src/prisma/prisma.errors";
import { PrismaService } from "src/prisma/prisma.service";
import { Auth0ManagementService } from "src/sdk/auth0/auth0-management.service";
import { AccountDeletionPrepService } from "./account-deletion-prep.service";
import { AppleIdentityRevocationService } from "./apple-identity-revocation.service";
import { hashProviderSub, isIssuedAfterDeletion } from "./deleted-provider-sub";
import { CreateUserDetailsDto } from "./dto/create-user-details.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsernameAvailabilityResponseDto } from "./dto/username-availability-response.dto";
import {
  ACCOUNT_DELETION_PHOTO_POLICY_FALLBACK,
  USERNAME_CHANGE_LIMIT,
  USERNAME_CHANGE_WINDOW_DAYS,
} from "./users.constants";
import { OnboardedUser, UserWithDetails, userWithDetailsInclude } from "./users.types";
import { normalizeUsername, usernameFormatReason } from "./username";

/** Fields the account-deletion saga needs; callers may pass a lean select. */
export type AccountDeletionUser = Pick<
  UserWithDetails,
  "id" | "providerSub" | "deletionStartedAt" | "auth0DeletedAt" | "deletionPhotoPolicy"
>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth0Management: Auth0ManagementService,
    private readonly deletionPrep: AccountDeletionPrepService,
    private readonly appleRevocation: AppleIdentityRevocationService,
    private readonly photoPurge: PhotoPurgeService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UsersService.name);
  }

  async createDetails(id: string, dto: CreateUserDetailsDto): Promise<UserWithDetails> {
    const user = await this.getById(id);

    if (user.details) {
      throw new ApiException("DETAILS_ALREADY_EXIST");
    }

    const username = this.requireWritableUsername(dto.username);

    try {
      const updated = await this.prisma.user.update({
        where: { id },
        data: {
          // The DTO only lets acceptedTerms: true through.
          termsAcceptedAt: new Date(),
          details: {
            create: {
              username,
              name: dto.name,
            },
          },
        },
        include: userWithDetailsInclude,
      });

      this.logger.info(
        { event: "user.onboarding.completed", userId: id, termsAccepted: !!updated.termsAcceptedAt },
        "User completed onboarding",
      );

      return updated;
    } catch (error) {
      this.rethrowUsernameTaken(error, username);
      throw error;
    }
  }

  async getById(id: string): Promise<UserWithDetails> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userWithDetailsInclude,
    });

    if (!user) throw new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("User", "ID", id));

    return user;
  }

  /** The user, or 422 while onboarding is incomplete: profile data hangs off the details row. */
  async getOnboardedById(id: string): Promise<OnboardedUser> {
    const user = await this.getById(id);

    if (!user.details) {
      throw new ApiException("ONBOARDING_INCOMPLETE");
    }

    return user as OnboardedUser;
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserWithDetails> {
    const current = await this.getOnboardedById(id);

    const data: UpdateUserDto = { ...dto };
    if (dto.username !== undefined) {
      data.username = this.requireWritableUsername(dto.username);
    }
    // Saving the username you already have is not a change and costs nothing.
    const newUsername =
      data.username !== undefined && data.username !== current.details.username ? data.username : null;

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (newUsername) await this.recordUsernameChange(tx, id, current.details.username, newUsername);

        return tx.user.update({
          where: { id },
          data: {
            details: {
              update: data,
            },
          },
          include: userWithDetailsInclude,
        });
      });

      this.logger.info(
        { event: "user.profile.updated", userId: id, fields: Object.keys(dto), usernameChanged: !!newUsername },
        "User profile updated",
      );

      return updated;
    } catch (error) {
      if (data.username) this.rethrowUsernameTaken(error, data.username);
      throw error;
    }
  }

  /**
   * Advisory check for the edit-username / onboarding fields. The caller's own
   * current username reports as available. Uniqueness on write is still enforced
   * by the database (see USERNAME_TAKEN).
   */
  async checkUsernameAvailability(callerId: string, raw: string): Promise<UsernameAvailabilityResponseDto> {
    const username = normalizeUsername(raw);
    const formatReason = usernameFormatReason(username);
    if (formatReason) {
      return { username, available: false, reason: formatReason };
    }

    const taken = await this.prisma.userDetails.findFirst({
      where: { username, NOT: { userId: callerId } },
      select: { userId: true },
    });

    if (taken) {
      return { username, available: false, reason: "TAKEN" };
    }

    return { username, available: true, reason: null };
  }

  async remove(id: string, photoPolicy: AccountDeletionPhotoPolicy): Promise<void> {
    const user = await this.getById(id);
    await this.completeAccountDeletion(user, photoPolicy);
  }

  /**
   * Dual-store account deletion saga (see docs/account-deletion.md).
   * Idempotent: safe for request retries and the account-deletion reconciler.
   *
   * Prep runs before the Auth0 call on purpose. Deleting the Auth0 identity
   * cannot be compensated, so nothing irreversible happens until the
   * application data is in a state that can actually be torn down; the other
   * order strands the user with no login and all their data.
   *
   * `photoPolicy` is only read when the saga starts, where the HTTP edge always
   * supplies it (`?photos=` is required); a resumed saga uses the choice already
   * stored on the row, and falls back to KEEP only if the row has none.
   */
  async completeAccountDeletion(user: AccountDeletionUser, photoPolicy?: AccountDeletionPhotoPolicy): Promise<void> {
    const { id, providerSub } = user;
    let deletionStartedAt = user.deletionStartedAt;
    let auth0DeletedAt = user.auth0DeletedAt;
    let policy = user.deletionPhotoPolicy;

    if (!deletionStartedAt) {
      policy = photoPolicy ?? ACCOUNT_DELETION_PHOTO_POLICY_FALLBACK;
      const started = await this.prisma.user.update({
        where: { id },
        data: { deletionStartedAt: new Date(), deletionPhotoPolicy: policy },
        select: { deletionStartedAt: true },
      });
      deletionStartedAt = started.deletionStartedAt;
      this.logger.info(
        { event: "user.account.deletion_started", userId: id, photoPolicy: policy, audit: true },
        "Account deletion saga started",
      );
    }

    // Settle events and photos so user.delete has nothing left to trip on and
    // no event is orphaned. Idempotent, so a resumed saga repeats it harmlessly.
    const { s3Keys } = await this.deletionPrep.prepareRelatedData(id, policy ?? ACCOUNT_DELETION_PHOTO_POLICY_FALLBACK);

    if (!auth0DeletedAt) {
      // Apple keeps the app authorised until the token Auth0 obtained is
      // revoked, and that token lives on the Auth0 user, so it has to go
      // before the user does. Idempotent: Apple answers 200 for a token that
      // is already revoked, so a resumed saga repeats it harmlessly.
      await this.appleRevocation.revokeBeforeAuth0Delete(id, providerSub);

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
    // Username frees immediately with the cascaded UserDetails row (EV-30 cool-down later).
    const providerSubHash = hashProviderSub(providerSub);
    await this.prisma.$transaction(async (tx) => {
      await tx.deletedProviderSub.upsert({
        where: { providerSubHash },
        create: { providerSubHash, formerUserId: id },
        update: { formerUserId: id, deletedAt: new Date() },
      });
      await tx.user.delete({ where: { id } });
    });

    this.logger.info(
      {
        event: "user.account.deleted",
        userId: id,
        deletionStartedAt,
        auth0DeletedAt,
        photoPolicy: policy,
        audit: true,
      },
      "User account deleted",
    );

    // S3 last and best effort (photos and the avatar alike): the rows are
    // already gone, so what is left at stake is storage cost, which the S3
    // orphan reconciler also covers.
    await this.photoPurge.purgeObjects(s3Keys, { event: ALERT_EVENTS.ACCOUNT_PHOTOS_PURGED, userId: id });
  }

  /**
   * Resolve the app user for an Auth0 `sub`, JIT-creating on first login.
   * Rejects mid-deletion rows and tombstoned identities (see docs/authentication.md).
   *
   * `issuedAt` is the token's `iat` claim. A tombstoned subject whose token was
   * minted after the deletion signed in again, which is a new account rather
   * than a resurrection of the old one.
   */
  async resolveByProviderSub(sub: string, issuedAt?: number): Promise<UserWithDetails> {
    const existing = await this.prisma.user.findUnique({
      where: { providerSub: sub },
      include: userWithDetailsInclude,
    });

    if (existing) {
      this.assertNotDeleting(existing);
      return existing;
    }

    return this.provisionUnlessTombstoned(sub, issuedAt);
  }

  private assertNotDeleting(user: UserWithDetails): void {
    if (!user.deletionStartedAt) return;

    this.logger.info(
      {
        event: "user.resolve.rejected_deletion_in_progress",
        userId: user.id,
        audit: true,
      },
      "Rejected resolve for account with deletion in progress",
    );
    // The client gets the generic 401, never told the account is going; the
    // reason only reaches the log line.
    throw new UnauthorizedException(RESPONSE_TEMPLATES.TOKEN_REJECTED("the account's deletion is in progress"));
  }

  private rejectTombstoned(formerUserId: string): never {
    this.logger.info(
      { event: "user.resolve.rejected_tombstone", formerUserId, audit: true },
      "Rejected JIT provisioning for tombstoned providerSub",
    );
    // The client gets the generic 401, never told the account was deleted; the
    // reason only reaches the log line.
    throw new UnauthorizedException(
      RESPONSE_TEMPLATES.TOKEN_REJECTED("the token was issued before this identity's account was deleted"),
    );
  }

  /**
   * A tombstone blocks the tokens the deleted account left behind, not the
   * person. Signing in again mints a token after the deletion, and that starts
   * a fresh empty account, the way a deleted messaging account can register
   * again. This matters most for social connections, where Auth0 derives the
   * same `sub` from the provider's stable user id after a re-signup; without
   * the `iat` comparison those users could never come back.
   *
   * A token with no `iat` cannot be placed in time and is refused. Auth0 always
   * sets it.
   */
  private async provisionUnlessTombstoned(sub: string, issuedAt?: number): Promise<UserWithDetails> {
    const providerSubHash = hashProviderSub(sub);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const tombstone = await tx.deletedProviderSub.findUnique({
          where: { providerSubHash },
        });
        if (tombstone && !isIssuedAfterDeletion(issuedAt, tombstone.deletedAt)) {
          this.rejectTombstoned(tombstone.formerUserId);
        }

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
        return this.resolveAfterProvisionRace(sub, issuedAt);
      }

      throw error;
    }
  }

  private async resolveAfterProvisionRace(sub: string, issuedAt?: number): Promise<UserWithDetails> {
    const existing = await this.prisma.user.findUnique({
      where: { providerSub: sub },
      include: userWithDetailsInclude,
    });

    if (existing) {
      this.assertNotDeleting(existing);
      return existing;
    }

    const tombstone = await this.prisma.deletedProviderSub.findUnique({
      where: { providerSubHash: hashProviderSub(sub) },
    });
    if (tombstone && !isIssuedAfterDeletion(issuedAt, tombstone.deletedAt)) {
      this.rejectTombstoned(tombstone.formerUserId);
    }

    // Generic 401: same client-visible outcome as an invalid session.
    throw new UnauthorizedException(
      RESPONSE_TEMPLATES.TOKEN_REJECTED(
        "creating this identity's account conflicted, and the account was gone on re-read",
      ),
    );
  }

  /** Format is already validated by the DTO; reserved names are rejected here. */
  private requireWritableUsername(raw: string): string {
    const username = normalizeUsername(raw);
    const reason = usernameFormatReason(username);
    if (reason === "INVALID_FORMAT") {
      throw new BadRequestException(RESPONSE_TEMPLATES.INVALID_FORMAT("Username", username));
    }
    if (reason === "RESERVED") {
      throw new ApiException("USERNAME_RESERVED", { username });
    }
    return username;
  }

  /**
   * When the user may change their username again, or null if they may now.
   * The limit counts changes in a rolling window, so the next one opens when
   * the oldest change inside it ages out.
   */
  async usernameChangeAvailableAt(userId: string, db: Prisma.TransactionClient = this.prisma): Promise<Date | null> {
    const windowMs = USERNAME_CHANGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const recent = await db.usernameChange.findMany({
      where: { userId, changedAt: { gt: new Date(Date.now() - windowMs) } },
      orderBy: { changedAt: "asc" },
      select: { changedAt: true },
      take: USERNAME_CHANGE_LIMIT,
    });
    if (recent.length < USERNAME_CHANGE_LIMIT) return null;

    return new Date(recent[0].changedAt.getTime() + windowMs);
  }

  /**
   * Enforces the limit and records the change, in the caller's transaction.
   * The user's row is locked first, so two changes sent at once are counted
   * one after the other and cannot both slip under the limit. If the update
   * then fails (the new name is taken), the record rolls back with it.
   */
  private async recordUsernameChange(
    tx: Prisma.TransactionClient,
    userId: string,
    oldUsername: string,
    newUsername: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;

    const availableAt = await this.usernameChangeAvailableAt(userId, tx);
    if (availableAt) throw new ApiException("USERNAME_CHANGE_LIMITED", { availableAt });

    await tx.usernameChange.create({ data: { userId, oldUsername, newUsername } });
  }

  private rethrowUsernameTaken(error: unknown, username: string): void {
    if (!isUniqueConstraintViolation(error)) return;
    throw new ApiException("USERNAME_TAKEN", { username });
  }
}
