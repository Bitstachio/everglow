import { NotificationType, Prisma } from "generated/prisma/client";
import { NOTIFICATION_CLAIM_LEASE_SECONDS } from "./notifications.constants";

/** A notification one sender pass holds. Only the holder sends it or settles it. */
export interface ClaimedNotification {
  id: string;
  userId: string;
  type: NotificationType;
  data: Prisma.JsonValue;
  /** Attempts including this one. */
  attempts: number;
  /** The lease this pass holds; every write that settles the row is matched on it. */
  claimedUntil: Date;
}

type Db = Pick<Prisma.TransactionClient, "$queryRaw">;

/** Same comparison as account-deletion-claim.ts: UTC wall time cast to the columns' type. */
const ts = (date: Date) => Prisma.sql`${date.toISOString()}::timestamp(3)`;

export const notificationLeaseUntil = (now: Date): Date =>
  new Date(now.getTime() + NOTIFICATION_CLAIM_LEASE_SECONDS * 1000);

/**
 * Claims up to `limit` due notifications nobody holds and counts the attempt.
 * `FOR UPDATE SKIP LOCKED` makes two instances that ask at once take
 * different rows, and the lease keeps them claimed while they are sent. A
 * pass that dies leaves its rows to be claimed again once the lease runs out.
 */
export const claimDueNotifications = async (
  db: Db,
  limit: number,
  now: Date = new Date(),
): Promise<ClaimedNotification[]> =>
  db.$queryRaw<ClaimedNotification[]>`
    UPDATE "Notification" SET
      "claimedUntil" = ${ts(notificationLeaseUntil(now))},
      "attempts" = "attempts" + 1
    WHERE "id" IN (
      SELECT "id" FROM "Notification"
      WHERE "status" = 'PENDING'::"NotificationStatus"
        AND "nextAttemptAt" <= ${ts(now)}
        AND ("claimedUntil" IS NULL OR "claimedUntil" < ${ts(now)})
      ORDER BY "nextAttemptAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "userId", "type", "data", "attempts", "claimedUntil"`;
