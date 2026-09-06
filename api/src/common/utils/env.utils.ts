/** A plain decimal integer, optionally signed, and nothing else. */
const DECIMAL_INTEGER = /^[+-]?\d+$/;

/**
 * Reads `value` as a decimal integer of at least `min`, falling back to
 * `fallback` for anything else.
 *
 * Environment variables arrive as unvalidated strings, so a typo has to be
 * inert rather than load-bearing: `BATCH_SIZE=abc` must not reach a query as
 * `NaN`. The pattern does the rejecting rather than `Number()`, which is too
 * eager to be a validator here — it reads `" "` as `0`, `"0x10"` as `16`, and
 * `"1e3"` as `1000`, so a whitespace-only value would land as a real zero and
 * quietly switch off whichever bound it was setting.
 *
 * The `min` floor is the part worth naming at each call site, because it
 * separates a key that may legitimately be zero — an age buffer switching
 * itself off — from one that may not, like a batch size that would otherwise
 * page forever doing no work.
 */
export const parseIntegerEnv = (value: string | undefined, fallback: number, min: number): number => {
  if (!value || !DECIMAL_INTEGER.test(value.trim())) return fallback;

  const parsed = Number(value);
  return parsed >= min ? parsed : fallback;
};
