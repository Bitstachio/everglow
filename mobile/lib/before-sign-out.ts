/**
 * Work that needs the account's access token one last time, run by the auth
 * context before a deliberate sign-out clears it: unregistering this phone
 * from push, for example. App-wide, like account-cleared.ts, so features can
 * register here without the auth context importing them.
 *
 * Bounded: sign-out never waits longer than BEFORE_SIGN_OUT_TIMEOUT_MS, and a
 * handler that fails, even by throwing before it returns a promise, does not
 * stop it.
 */

/**
 * Why the account is leaving this phone.
 *
 * - signedOut: the person signed out
 * - accountDeleted: the account was just deleted; its token no longer works
 *   and its data is gone with it
 */
export type SignOutReason = "signedOut" | "accountDeleted";

export type BeforeSignOutContext = { reason: SignOutReason };

type BeforeSignOutHandler = (context: BeforeSignOutContext) => void | Promise<void>;

export const BEFORE_SIGN_OUT_TIMEOUT_MS = 3000;

const handlers = new Set<BeforeSignOutHandler>();

export const onBeforeSignOut = (handler: BeforeSignOutHandler) => {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
};

export const runBeforeSignOut = async (context: BeforeSignOutContext): Promise<void> => {
  const all = Promise.allSettled([...handlers].map((handler) => Promise.resolve().then(() => handler(context))));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, BEFORE_SIGN_OUT_TIMEOUT_MS);
  });
  await Promise.race([all, timeout]);
  clearTimeout(timer);
};
