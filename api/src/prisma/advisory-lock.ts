import { Prisma } from "generated/prisma/client";

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
