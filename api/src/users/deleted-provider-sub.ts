import { createHash } from "node:crypto";

/** The tombstone keeps only this: enough to recognise the subject again, not enough to name it. */
export const hashProviderSub = (providerSub: string): string => createHash("sha256").update(providerSub).digest("hex");

/**
 * True when a token was issued after the account it names was deleted, which
 * makes it a genuine new sign-in rather than a leftover of the deleted
 * account. `issuedAt` is the JWT `iat` claim, in seconds. A token without one
 * cannot be placed in time and is treated as pre-deletion, the safe side.
 */
export const isIssuedAfterDeletion = (issuedAt: number | undefined, deletedAt: Date): boolean =>
  issuedAt !== undefined && issuedAt * 1000 > deletedAt.getTime();

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a tombstone that carries nothing is kept. It only has to outlive
 * every access token the deleted account was issued (Auth0's default is 24
 * hours), and a month is a comfortable margin over any lifetime we would set.
 */
export const TOMBSTONE_RETENTION_DAYS = 30;

/** A report about the deleted account, found by its evidence's subject. */
export interface TombstoneRelatedReport {
  /** Null while the report is OPEN. */
  resolvedAt: Date | null;
  holdUntil: Date | null;
}

export interface TombstoneRetentionInput {
  deletedAt: Date;
  /** The tombstone carries a suspension or at least one event ban. */
  sanctioned: boolean;
  relatedReports: TombstoneRelatedReport[];
  /** REPORT_RETENTION_DAYS. */
  reportRetentionDays: number;
}

/**
 * When a tombstone may be purged, or null while it must be kept with no date
 * yet (docs/account-deletion.md §6a):
 *
 * - one that carries nothing goes TOMBSTONE_RETENTION_DAYS after the deletion;
 * - one that carries a suspension or a ban is the only thing still enforcing
 *   that decision, so it stays at least REPORT_RETENTION_DAYS after the
 *   deletion, and for as long as any report about the account is kept: while
 *   one is OPEN, and until the latest of them is purged (REPORT_RETENTION_DAYS
 *   after it closes, or when its hold ends if that is later).
 *
 * The floor of a full retention period after the deletion matters because
 * suspending an account closes its member reports: measured from those alone,
 * an account suspended months before it was deleted would come back clean
 * soon after.
 */
export const tombstoneExpiresAt = ({
  deletedAt,
  sanctioned,
  relatedReports,
  reportRetentionDays,
}: TombstoneRetentionInput): Date | null => {
  const base = deletedAt.getTime() + TOMBSTONE_RETENTION_DAYS * DAY_MS;
  if (!sanctioned) return new Date(base);

  let expiresAt = Math.max(base, deletedAt.getTime() + reportRetentionDays * DAY_MS);
  for (const report of relatedReports) {
    if (!report.resolvedAt) return null;
    const purgedAt = Math.max(
      report.resolvedAt.getTime() + reportRetentionDays * DAY_MS,
      report.holdUntil?.getTime() ?? 0,
    );
    expiresAt = Math.max(expiresAt, purgedAt);
  }
  return new Date(expiresAt);
};
