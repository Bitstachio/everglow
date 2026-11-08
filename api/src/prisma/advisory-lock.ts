import { Prisma, PrismaClient } from "generated/prisma/client";

/**
 * Takes a transaction-scoped Postgres advisory lock on `key`, held until the
 * transaction ends. Two transactions that lock the same key run their
 * check-then-insert one after the other, so a count cannot be read stale by a
 * concurrent insert. Keys are free text; hashtextextended maps them to the
 * 64-bit lock space.
 */
export const lockForTransaction = async (tx: Prisma.TransactionClient, key: string): Promise<void> => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
};

/**
 * Runs `work` unless another instance is running it under the same `key`, for
 * jobs that every replica schedules but one run at a time is enough (and N
 * would cost N times the calls). A transaction holds a transaction-scoped
 * advisory lock for as long as `work` runs; `work` uses its own connections,
 * not that transaction. A replica that finds the lock held skips the run and
 * gets `{ ran: false }`. `timeoutMs` bounds how long the lock is held: past
 * it, the holding transaction is rolled back and the lock released, so make
 * it longer than any run.
 */
export const runExclusively = async <T>(
  prisma: Pick<PrismaClient, "$transaction">,
  key: string,
  timeoutMs: number,
  work: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false }> =>
  prisma.$transaction(
    async (tx) => {
      const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS "locked"`;
      if (!row?.locked) return { ran: false as const };
      return { ran: true as const, result: await work() };
    },
    { timeout: timeoutMs, maxWait: 10_000 },
  );
