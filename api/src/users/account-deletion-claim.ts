import { AccountDeletionPhotoPolicy, Prisma } from "generated/prisma/client";
import { ACCOUNT_DELETION_CLAIM_LEASE_SECONDS } from "./users.constants";

/**
 * A deletion one pass of the saga holds the claim on. Only the holder runs the
 * saga for that row, so a request and the reconciler, or two reconciler
 * instances, never run it side by side (docs/account-deletion.md §4).
 */
export interface ClaimedDeletion {
  id: string;
  providerSub: string;
  deletionStartedAt: Date;
  auth0DeletedAt: Date | null;
  deletionPhotoPolicy: AccountDeletionPhotoPolicy | null;
  deletionAttempts: number;
  /** The lease this pass holds; releasing it is matched on this value. */
  deletionClaimedUntil: Date;
}

type Db = Pick<Prisma.TransactionClient, "$queryRaw">;

/**
 * Timestamps are compared as text cast to `timestamp(3)`, the columns' type.
 * The columns hold UTC wall time without a zone, and Postgres drops the `Z`
 * when it casts an ISO string to `timestamp`, so the comparison does not
 * depend on the session's time zone the way `now()` would.
 */
const ts = (date: Date) => Prisma.sql`${date.toISOString()}::timestamp(3)`;

const RETURNING = Prisma.sql`RETURNING "id", "providerSub", "deletionStartedAt", "auth0DeletedAt",
  "deletionPhotoPolicy", "deletionAttempts", "deletionClaimedUntil"`;

export const leaseUntil = (now: Date): Date => new Date(now.getTime() + ACCOUNT_DELETION_CLAIM_LEASE_SECONDS * 1000);

/**
 * `DELETE /users/me`: stamps the intent (once; a resumed deletion keeps its
 * first timestamp and photo choice) and takes the claim, in one statement.
 * Null when another pass holds an unexpired claim, or the row is gone.
 */
export const claimDeletionForRequest = async (
  db: Db,
  userId: string,
  photoPolicy: AccountDeletionPhotoPolicy,
  now: Date = new Date(),
): Promise<ClaimedDeletion | null> => {
  const rows = await db.$queryRaw<ClaimedDeletion[]>`
    UPDATE "User" SET
      "deletionStartedAt" = COALESCE("deletionStartedAt", ${ts(now)}),
      "deletionPhotoPolicy" = COALESCE("deletionPhotoPolicy", ${photoPolicy}::"AccountDeletionPhotoPolicy"),
      "deletionClaimedUntil" = ${ts(leaseUntil(now))}
    WHERE "id" = ${userId}::uuid
      AND ("deletionClaimedUntil" IS NULL OR "deletionClaimedUntil" < ${ts(now)})
    ${RETURNING}`;
  return rows[0] ?? null;
};

export interface PendingDeletionFilter {
  /** Only deletions started before this: a fresh one belongs to its request. */
  startedBefore: Date;
  maxAttempts: number;
  /** Rows this run already tried, so a failure is not picked up again straight away. */
  skipIds: string[];
}

/**
 * The reconciler: claims the oldest pending deletion nobody holds. `FOR UPDATE
 * SKIP LOCKED` makes two instances that ask at once take different rows
 * instead of the same one, and the lease keeps a row claimed after the
 * statement, for as long as its saga runs.
 */
export const claimNextPendingDeletion = async (
  db: Db,
  { startedBefore, maxAttempts, skipIds }: PendingDeletionFilter,
  now: Date = new Date(),
): Promise<ClaimedDeletion | null> => {
  const rows = await db.$queryRaw<ClaimedDeletion[]>`
    UPDATE "User" SET "deletionClaimedUntil" = ${ts(leaseUntil(now))}
    WHERE "id" = (
      SELECT "id" FROM "User"
      WHERE "deletionStartedAt" IS NOT NULL
        AND "deletionStartedAt" < ${ts(startedBefore)}
        AND "deletionAttempts" < ${maxAttempts}
        AND ("deletionClaimedUntil" IS NULL OR "deletionClaimedUntil" < ${ts(now)})
        AND NOT ("id" = ANY(${skipIds}::uuid[]))
      ORDER BY "deletionStartedAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    ${RETURNING}`;
  return rows[0] ?? null;
};

/** Gives the claim up after a failed pass, so the person can retry at once. Only this pass's own lease. */
export const releaseDeletionClaim = async (db: Db, claim: ClaimedDeletion): Promise<void> => {
  await db.$queryRaw`
    UPDATE "User" SET "deletionClaimedUntil" = NULL
    WHERE "id" = ${claim.id}::uuid AND "deletionClaimedUntil" = ${ts(claim.deletionClaimedUntil)}
    RETURNING "id"`;
};
