/** Resolves after `ms` milliseconds. */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Delay before retry number `attempt` (1-based): `baseMs` per attempt so far,
 * plus up to one more `baseMs` of jitter.
 *
 * The jitter is the load-bearing half. Callers that lose the same round of
 * contention would otherwise all wake at the same instant and collide again,
 * turning a backoff into a synchronised retry storm. Linear growth suits
 * contention that clears a few participants per round; a caller waiting on an
 * unrelated outage usually wants exponential growth instead.
 */
export const jitteredLinearBackoffMs = (attempt: number, baseMs: number): number =>
  baseMs * attempt + Math.random() * baseMs;
