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

/**
 * Maps `items` through `fn` with at most `concurrency` calls in flight,
 * keeping the input order in the result. Rejects as soon as one call does,
 * like Promise.all; callers that must not fail catch inside `fn`.
 */
export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker));
  return results;
};
