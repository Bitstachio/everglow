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
