import { dehydrate, type Query, type QueryClient } from "@tanstack/react-query";
import type { User } from "@/lib/auth";
import type { SignedInIdentity } from "@/lib/auth0";
import { removeSessionSnapshot, saveSessionSnapshot } from "@/lib/session-cache";

/** Writes wait this long, so a burst of queries landing together is one write. */
export const SESSION_WRITE_DELAY_MS = 1000;

export type PersistedSession = { userId: string; identity: SignedInIdentity | null; profile: User };

/**
 * Only queries that opted in, and only once they hold data from the API. A
 * refetch that failed leaves the query in error with its last answer still
 * there, and that answer is still worth keeping.
 */
export const isPersistedQuery = (query: Query) => query.meta?.persist === true && query.state.data !== undefined;

/**
 * Keeps the session snapshot (`lib/session-cache.ts`) in step with the signed-in
 * account and its opted-in queries. The auth context owns it: it sets the
 * session after sign-in and clears it with the account.
 */
export const createSessionPersister = (queryClient: QueryClient, delayMs = SESSION_WRITE_DELAY_MS) => {
  let session: PersistedSession | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const write = () => {
    timer = undefined;
    if (!session) return;
    try {
      const saved = dehydrate(queryClient, {
        shouldDehydrateQuery: isPersistedQuery,
        shouldDehydrateMutation: () => false,
      });
      // Nothing has loaded yet (the profile answers before the rolls do): what
      // is on disk from last time is worth more than a Home with nothing on it.
      if (saved.queries.length === 0) return;
      saveSessionSnapshot({
        ...session,
        savedAt: Date.now(),
        queries: {
          ...saved,
          // Saved as the answer it holds, not as the failed refetch after it.
          queries: saved.queries.map((query) => ({
            ...query,
            state: {
              ...query.state,
              status: "success" as const,
              fetchStatus: "idle" as const,
              error: null,
              fetchFailureCount: 0,
              fetchFailureReason: null,
            },
          })),
        },
      });
    } catch {
      // A full disk only costs the offline launch; the next change tries again.
    }
  };

  const schedule = () => {
    if (!session || timer !== undefined) return;
    timer = setTimeout(write, delayMs);
  };

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "success" && event.query.meta?.persist === true) schedule();
  });

  return {
    /** The account signed in now, or null while there is none; null never deletes what's saved. */
    setSession: (next: PersistedSession | null) => {
      session = next;
      if (next) schedule();
      else {
        clearTimeout(timer);
        timer = undefined;
      }
    },
    /** The account is leaving this phone: forget it, on disk too. */
    clear: () => {
      session = null;
      clearTimeout(timer);
      timer = undefined;
      removeSessionSnapshot();
    },
    stop: () => {
      clearTimeout(timer);
      timer = undefined;
      unsubscribe();
    },
  };
};

export type SessionPersister = ReturnType<typeof createSessionPersister>;
