// One UUID path segment of an S3 key, for the patterns that recognise keys the
// API minted. Matched case-insensitively by its users.
export const S3_KEY_UUID_SEGMENT = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

// The orphan reconciler deletes at most this many objects per run, across all
// registered prefixes. It bounds the blast radius of a bad run more than the
// work: every prefix is walked end to end regardless, and whatever is left
// waits for the next run.
export const DEFAULT_ORPHAN_RECONCILER_BATCH_SIZE = 100;

// Objects younger than this are never considered orphans, so an upload that
// finished moments ago is safe even if its row is somehow not visible yet.
// Matches the stale-PENDING photo cleanup age.
export const DEFAULT_ORPHAN_RECONCILER_MIN_OBJECT_AGE_HOURS = 24;

export const ORPHAN_SOURCE_ERRORS = {
  INVALID_PREFIX: (prefix: string) => `Orphan source prefix "${prefix}" must be non-empty and end with "/"`,
  OVERLAPPING_PREFIX: (prefix: string, existing: string) =>
    `Orphan source prefix "${prefix}" overlaps the already registered prefix "${existing}"`,
};
