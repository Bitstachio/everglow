import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { AccountDeletionPhotoPolicy, Prisma } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";
import { ApiException } from "src/common/errors/api.exception";
import { subjectUsernameScrubbable } from "src/moderation/evidence/subject-username";
import { isUniqueConstraintViolation } from "src/prisma/prisma.errors";
import { PrismaService } from "src/prisma/prisma.service";
import { Auth0ManagementService } from "src/sdk/auth0/auth0-management.service";
import { ClaimedDeletion, claimDeletionForRequest, releaseDeletionClaim } from "./account-deletion-claim";
import { AccountDeletionOutboxService } from "./account-deletion-outbox.service";
import { AccountDeletionPreflightService } from "./account-deletion-preflight.service";
import { AccountDeletionPrepService, OrganizedEventFate } from "./account-deletion-prep.service";
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
import { normalizeUsername, USERNAME_SUGGESTION_COUNT, usernameCandidates, usernameFormatReason } from "./username";

type TombstoneWithBans = Prisma.DeletedProviderSubGetPayload<{
  include: { bans: { select: { eventId: true; bannedAt: true } } };
}>;

/** What a sign-in took over from the tombstone of the identity's deleted account. */
interface CarriedSanctions {
  formerUserId: string;
  suspendedAt: Date | null;
  eventIds: string[];
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth0Management: Auth0ManagementService,
    private readonly deletionPrep: AccountDeletionPrepService,
    private readonly preflight: AccountDeletionPreflightService,
    private readonly appleRevocation: AppleIdentityRevocationService,
    private readonly outbox: AccountDeletionOutboxService,
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
   * by the database (see USERNAME_TAKEN). A taken or reserved name comes with
   * free alternatives built from it and the caller's `name`.
   */
  async checkUsernameAvailability(
    callerId: string,
    raw: string,
    name?: string,
  ): Promise<UsernameAvailabilityResponseDto> {
    const username = normalizeUsername(raw);
    const formatReason = usernameFormatReason(username);
    if (formatReason === "INVALID_FORMAT") {
      return { username, available: false, reason: formatReason, suggestions: [] };
    }
    if (formatReason === "RESERVED") {
      return {
        username,
        available: false,
        reason: formatReason,
        suggestions: await this.freeUsernames(callerId, username, name),
      };
    }

    const taken = await this.prisma.userDetails.findFirst({
      where: { username, NOT: { userId: callerId } },
      select: { userId: true },
    });

    if (taken) {
      return {
        username,
        available: false,
        reason: "TAKEN",
        suggestions: await this.freeUsernames(callerId, username, name),
      };
    }

    return { username, available: true, reason: null, suggestions: [] };
  }

  /** The first few candidates for `username` that nobody else holds, in one query. */
  private async freeUsernames(callerId: string, username: string, name?: string): Promise<string[]> {
    const candidates = usernameCandidates(username, name);
    const held = await this.prisma.userDetails.findMany({
      where: { username: { in: candidates }, NOT: { userId: callerId } },
      select: { username: true },
    });
    const heldNames = new Set(held.map((row) => row.username));
    return candidates.filter((candidate) => !heldNames.has(candidate)).slice(0, USERNAME_SUGGESTION_COUNT);
  }

  /** What deleting the account now would do to each event it organizes alone (prep, rolled back). */
  async previewDeletion(id: string, photoPolicy: AccountDeletionPhotoPolicy): Promise<OrganizedEventFate[]> {
    await this.getById(id);
    return this.deletionPrep.preview(id, photoPolicy);
  }

  /**
   * `DELETE /users/me`. Checks the deletion can finish before writing
   * anything, then claims the row and runs the saga. An account whose
   * deletion already started may call it again: the saga resumes with the
   * photo choice it started with.
   */
  async remove(id: string, photoPolicy: AccountDeletionPhotoPolicy): Promise<void> {
    const user = await this.getById(id);
    await this.preflight.assertCanFinish(user);

    const claimed = await claimDeletionForRequest(this.prisma, id, photoPolicy);
    if (!claimed) {
      // Gone: another pass finished it in the meantime, which is what was asked.
      if (!(await this.userExists(id))) return;
      // The reconciler, or this person's other request, is running it now.
      throw new ApiException("ACCOUNT_DELETION_IN_PROGRESS");
    }

    this.logger.info(
      {
        event: user.deletionStartedAt ? "user.account.deletion_resumed" : "user.account.deletion_started",
        userId: id,
        photoPolicy: claimed.deletionPhotoPolicy,
        audit: true,
      },
      user.deletionStartedAt ? "Account deletion saga resumed by its owner" : "Account deletion saga started",
    );

    await this.completeAccountDeletion(claimed);
  }

  /**
   * Dual-store account deletion saga (see docs/account-deletion.md), for a
   * row the caller has claimed. Idempotent: safe for request retries and the
   * account-deletion reconciler.
   *
   * Prep runs before the Auth0 call on purpose. Deleting the Auth0 identity
   * cannot be compensated, so nothing irreversible happens until the
   * application data is in a state that can actually be torn down; the other
   * order strands the user with no login and all their data.
   *
   * The photo choice is the one stored when the saga started; a row that
   * somehow has none falls back to KEEP.
   *
   * Returns "vanished" when the row was already gone, which a concurrent pass
   * finishing first can cause: that is the outcome asked for, not a failure.
   * A failed pass gives its claim up, so the person can retry straight away.
   */
  async completeAccountDeletion(claimed: ClaimedDeletion): Promise<"deleted" | "vanished"> {
    try {
      return await this.runClaimedDeletion(claimed);
    } catch (error) {
      if (!(await this.userExists(claimed.id).catch(() => true))) {
        this.logger.info(
          { event: "user.account.deletion_vanished", userId: claimed.id, audit: true },
          "Account deletion pass found the row already deleted by another pass",
        );
        return "vanished";
      }
      await releaseDeletionClaim(this.prisma, claimed).catch(() => undefined);
      throw error;
    }
  }

  private async userExists(id: string): Promise<boolean> {
    return (await this.prisma.user.findUnique({ where: { id }, select: { id: true } })) !== null;
  }

  private async runClaimedDeletion(claimed: ClaimedDeletion): Promise<"deleted" | "vanished"> {
    const { id, providerSub, deletionStartedAt } = claimed;
    let auth0DeletedAt = claimed.auth0DeletedAt;
    const policy = claimed.deletionPhotoPolicy ?? ACCOUNT_DELETION_PHOTO_POLICY_FALLBACK;

    // Settle events and photos so user.delete has nothing left to trip on and
    // no event is orphaned. Idempotent, so a resumed saga repeats it harmlessly.
    await this.deletionPrep.prepareRelatedData(id, policy);

    // The objects of the rows prep removed, queued in its transaction: purge
    // them now, so a failure at Apple or Auth0 below costs no privacy. A
    // resumed saga drains what an earlier pass could not. Never throws.
    await this.outbox.drain({ userId: id });

    if (!auth0DeletedAt) {
      // Apple keeps the app authorised until the token Auth0 obtained is
      // revoked, and that token lives on the Auth0 user, so it has to go
      // before the user does. Idempotent: Apple answers 200 for a token that
      // is already revoked, so a resumed saga repeats it harmlessly.
      await this.appleRevocation.revokeBeforeAuth0Delete(id, providerSub);

      // Leave deletionStartedAt set if Auth0 fails so a lost success response
      // cannot drop the durable marker; retries treat Auth0 404 as success.
      await this.auth0Management.deleteUser(providerSub);
      auth0DeletedAt = new Date();
      const cleared = await this.prisma.user.updateMany({ where: { id }, data: { auth0DeletedAt } });
      if (cleared.count === 0) return "vanished";
      this.logger.info(
        { event: "user.account.auth0_deleted", userId: id, audit: true },
        "Auth0 identity deleted for account deletion saga",
      );
    }

    // Tombstone before (or with) the hard delete so an in-flight JWT cannot JIT
    // recreate this providerSub. Upsert keeps reconciler retries idempotent.
    // Username frees immediately with the cascaded UserDetails row (EV-30 cool-down later).
    const providerSubHash = hashProviderSub(providerSub);
    const carried = await this.prisma.$transaction(async (tx) => {
      const sanctions = await this.lockSanctions(tx, id);
      await tx.deletedProviderSub.upsert({
        where: { providerSubHash },
        create: { providerSubHash, formerUserId: id, suspendedAt: sanctions.suspendedAt },
        update: { formerUserId: id, deletedAt: new Date(), suspendedAt: sanctions.suspendedAt },
      });
      // The tombstone carries the bans the account has now, not those of an
      // earlier deletion of the same identity.
      await tx.carriedBan.deleteMany({ where: { providerSubHash } });
      if (sanctions.bans.length > 0) {
        await tx.carriedBan.createMany({
          data: sanctions.bans.map((ban) => ({ providerSubHash, eventId: ban.eventId, bannedAt: ban.createdAt })),
          skipDuplicates: true,
        });
      }
      // Reports about the account outlive it, but its username does not,
      // except while a child-safety or law-enforcement hold may need it; the
      // evidence job scrubs those when the hold ends.
      const scrubbed = await tx.reportEvidence.updateMany({
        where: { subjectUserId: id, subjectUsername: { not: null }, report: subjectUsernameScrubbable(new Date()) },
        data: { subjectUsername: null },
      });
      await tx.user.delete({ where: { id } });
      return {
        suspended: sanctions.suspendedAt !== null,
        bans: sanctions.bans.length,
        usernamesScrubbed: scrubbed.count,
      };
    });

    this.logger.info(
      {
        event: "user.account.deleted",
        userId: id,
        deletionStartedAt,
        auth0DeletedAt,
        photoPolicy: policy,
        suspensionCarried: carried.suspended,
        bansCarried: carried.bans,
        evidenceUsernamesScrubbed: carried.usernamesScrubbed,
        audit: true,
      },
      "User account deleted",
    );

    return "deleted";
  }

  /**
   * The suspension and event bans the tombstone has to carry, read under a
   * lock on the user's row. The lock makes a suspension, or a ban (whose
   * foreign key check needs the row too), that lands while the account is
   * being deleted wait for the delete and then fail, instead of committing
   * just after this read and vanishing with the row.
   */
  private async lockSanctions(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<{ suspendedAt: Date | null; bans: { eventId: string; createdAt: Date }[] }> {
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { suspendedAt: true, eventBans: { select: { eventId: true, createdAt: true } } },
    });
    // No row: a concurrent pass already deleted it, and the user.delete that
    // follows fails and rolls this transaction back, tombstone included.
    return { suspendedAt: user?.suspendedAt ?? null, bans: user?.eventBans ?? [] };
  }

  /**
   * Resolve the app user for an Auth0 `sub`, JIT-creating on first login.
   * Rejects tombstoned identities (see docs/authentication.md); a row whose
   * deletion has started is returned and left to the guard.
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

    // A row mid-deletion is returned as it is: JwtAuthGuard refuses it with
    // ACCOUNT_DELETION_IN_PROGRESS on every route but DELETE /users/me, which
    // resumes the deletion.
    if (existing) return existing;

    return this.provisionUnlessTombstoned(sub, issuedAt);
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
   *
   * The fresh account is not a clean slate for the platform's and organizers'
   * decisions: a suspension and the event bans the deleted account had come
   * back with it (docs/account-deletion.md §6a), and move off the tombstone in
   * the same transaction, so there is one place each is lifted from.
   */
  private async provisionUnlessTombstoned(sub: string, issuedAt?: number): Promise<UserWithDetails> {
    const providerSubHash = hashProviderSub(sub);
    try {
      const { created, carried } = await this.prisma.$transaction(async (tx) => {
        const tombstone = await tx.deletedProviderSub.findUnique({
          where: { providerSubHash },
          include: { bans: { select: { eventId: true, bannedAt: true } } },
        });
        if (tombstone && !isIssuedAfterDeletion(issuedAt, tombstone.deletedAt)) {
          this.rejectTombstoned(tombstone.formerUserId);
        }

        const user = await tx.user.create({
          data: { providerSub: sub, ...(tombstone?.suspendedAt && { suspendedAt: tombstone.suspendedAt }) },
          include: userWithDetailsInclude,
        });
        return { created: user, carried: tombstone ? await this.carrySanctionsOver(tx, tombstone, user.id) : null };
      });

      this.logger.info({ event: "user.provisioned", userId: created.id }, "Provisioned new user on first login");
      if (carried?.suspendedAt) {
        this.logger.info(
          {
            event: "user.account.suspension_carried_over",
            userId: created.id,
            formerUserId: carried.formerUserId,
            suspendedAt: carried.suspendedAt,
            audit: true,
          },
          "Suspension of a deleted account carried over to its new account",
        );
      }
      if (carried && carried.eventIds.length > 0) {
        this.logger.info(
          {
            event: "user.account.bans_carried_over",
            userId: created.id,
            formerUserId: carried.formerUserId,
            eventIds: carried.eventIds,
            audit: true,
          },
          "Event bans of a deleted account carried over to its new account",
        );
      }
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

  /**
   * Moves a deleted account's suspension and event bans onto the account just
   * created for the same identity, in the caller's transaction. Bans only
   * exist here for events that still exist: they cascade with the event.
   */
  private async carrySanctionsOver(
    tx: Prisma.TransactionClient,
    tombstone: TombstoneWithBans,
    userId: string,
  ): Promise<CarriedSanctions> {
    const { providerSubHash, formerUserId, suspendedAt, bans } = tombstone;
    if (!suspendedAt && bans.length === 0) return { formerUserId, suspendedAt: null, eventIds: [] };

    if (bans.length > 0) {
      await tx.eventBan.createMany({
        data: bans.map((ban) => ({ eventId: ban.eventId, userId, createdAt: ban.bannedAt })),
        skipDuplicates: true,
      });
      await tx.carriedBan.deleteMany({ where: { providerSubHash } });
    }
    if (suspendedAt) {
      await tx.deletedProviderSub.update({ where: { providerSubHash }, data: { suspendedAt: null } });
    }

    return { formerUserId, suspendedAt, eventIds: bans.map((ban) => ban.eventId) };
  }

  private async resolveAfterProvisionRace(sub: string, issuedAt?: number): Promise<UserWithDetails> {
    const existing = await this.prisma.user.findUnique({
      where: { providerSub: sub },
      include: userWithDetailsInclude,
    });

    if (existing) return existing;

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
