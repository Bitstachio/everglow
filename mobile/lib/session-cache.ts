import type { DehydratedState } from "@tanstack/react-query";
import { Directory, File, Paths } from "expo-file-system";
import { z } from "zod";
import type { User } from "@/lib/auth";
import type { SignedInIdentity } from "@/lib/auth0";

/**
 * What this phone keeps of the signed-in account so the app can open without a
 * network: the profile, who Auth0 said was signed in, and the queries that
 * opted in with `meta: { persist: true }` (Home's rolls and their strips).
 *
 * One snapshot per phone, for the account signed in now. It lives in the app's
 * private cache folder: encrypted at rest by the OS, left out of device
 * backups, and deleted whenever the account is cleared from this phone. It
 * never holds tokens or upload links.
 */
export type SessionSnapshot = {
  savedAt: number;
  userId: string;
  identity: SignedInIdentity | null;
  profile: User;
  queries: DehydratedState;
};

/** Older than this, the rolls it shows are more likely wrong than useful. */
export const SESSION_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const VERSION = 1;

const snapshotSchema = z.object({
  version: z.literal(VERSION),
  savedAt: z.number(),
  userId: z.string().min(1),
  identity: z.object({ sub: z.string(), email: z.string().optional(), name: z.string().optional() }).nullable(),
  profile: z.looseObject({ id: z.string().min(1) }),
  queries: z.looseObject({ queries: z.array(z.unknown()), mutations: z.array(z.unknown()) }),
});

const snapshotFile = () => new File(new Directory(Paths.cache, "session"), "snapshot.json");

export const removeSessionSnapshot = () => {
  try {
    const file = snapshotFile();
    if (file.exists) file.delete();
  } catch {
    // Nothing more to do: the next save overwrites it, and a read checks whose it is.
  }
};

export const saveSessionSnapshot = (snapshot: SessionSnapshot) => {
  const directory = new Directory(Paths.cache, "session");
  directory.create({ intermediates: true, idempotent: true });
  snapshotFile().write(JSON.stringify({ version: VERSION, ...snapshot }));
};

/**
 * The saved snapshot when it can stand in for the API: readable, recent, and
 * for the person signed in (`sub`, when Auth0 could say who that is offline).
 * Anything else is deleted so it can't show later.
 */
export const readSessionSnapshot = ({
  sub,
  now = Date.now(),
}: {
  sub: string | undefined;
  now?: number;
}): SessionSnapshot | null => {
  let saved: z.infer<typeof snapshotSchema>;
  try {
    const file = snapshotFile();
    if (!file.exists) return null;
    saved = snapshotSchema.parse(JSON.parse(file.textSync()));
  } catch {
    removeSessionSnapshot();
    return null;
  }
  const expired = now - saved.savedAt > SESSION_SNAPSHOT_MAX_AGE_MS;
  const someoneElse = sub !== undefined && saved.identity !== null && saved.identity.sub !== sub;
  if (expired || someoneElse || saved.profile.id !== saved.userId) {
    removeSessionSnapshot();
    return null;
  }
  return {
    savedAt: saved.savedAt,
    userId: saved.userId,
    identity: saved.identity,
    profile: saved.profile as unknown as User,
    queries: saved.queries as unknown as DehydratedState,
  };
};
