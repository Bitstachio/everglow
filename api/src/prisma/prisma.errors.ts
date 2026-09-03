/**
 * Recognising a database failure means recognising Prisma's error *shapes*, not
 * just its codes. The same Postgres failure reaches us two different ways: raised
 * inside a transaction callback it arrives mapped, as a `PrismaClientKnownRequestError`
 * with a `P` code, but raised at `COMMIT` it is rethrown by the driver adapter
 * unmapped, carrying the raw SQLSTATE inside a nested `cause`.
 *
 * That dialect lives here, beside `PrismaService`, so no feature module has to
 * learn it. Add new predicates to this file rather than to a service.
 */

// Prisma's mapped code for a transaction that lost a write conflict or deadlock.
const PRISMA_TRANSACTION_WRITE_CONFLICT = "P2034";
// The driver adapter's own name for that failure when it surfaces at COMMIT.
const DRIVER_TRANSACTION_WRITE_CONFLICT = "TransactionWriteConflict";
// Postgres SQLSTATE 40001, the serialization failure behind both of the above.
const POSTGRES_SERIALIZATION_FAILURE = "40001";

// Wrapped errors nest a few levels deep. The bound also stops a cyclic cause
// chain from spinning forever.
const MAX_CAUSE_DEPTH = 5;

type ErrorLike = { code?: unknown; kind?: unknown; originalCode?: unknown; cause?: unknown };

/** Applies a predicate to the thrown error and each error in its cause chain. */
const someCause = (error: unknown, predicate: (candidate: ErrorLike) => boolean): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && typeof current === "object" && current !== null; depth++) {
    if (predicate(current as ErrorLike)) return true;
    current = (current as ErrorLike).cause;
  }
  return false;
};

/**
 * True when a transaction was aborted because it could not be serialized against
 * a concurrent one. Retrying the whole transaction is the correct response; the
 * caller decides how many times and how long to wait.
 */
export const isSerializationFailure = (error: unknown): boolean =>
  someCause(
    error,
    ({ code, kind, originalCode }) =>
      code === PRISMA_TRANSACTION_WRITE_CONFLICT ||
      code === POSTGRES_SERIALIZATION_FAILURE ||
      kind === DRIVER_TRANSACTION_WRITE_CONFLICT ||
      originalCode === POSTGRES_SERIALIZATION_FAILURE,
  );
