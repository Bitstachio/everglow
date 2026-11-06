/**
 * Work that needs the account's access token one last time, run by the auth
 * context before a deliberate sign-out clears it: unregistering this phone
 * from push, for example. App-wide, like account-cleared.ts, so features can
 * register here without the auth context importing them.
 *
 * Bounded: sign-out never waits longer than BEFORE_SIGN_OUT_TIMEOUT_MS, and a
 * handler that fails does not stop it.
 */
export type BeforeSignOutContext = {
  /** The account was just deleted: its token no longer works and its data is gone with it. */
  accountDeleted: boolean;
};

export const BEFORE_SIGN_OUT_TIMEOUT_MS = 3000;

const handlers = new Set<(context: BeforeSignOutContext) => Promise<void>>();

export const onBeforeSignOut = (handler: (context: BeforeSignOutContext) => Promise<void>) => {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
};

export const runBeforeSignOut = async (context: BeforeSignOutContext): Promise<void> => {
  const all = Promise.allSettled([...handlers].map((handler) => handler(context)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, BEFORE_SIGN_OUT_TIMEOUT_MS);
  });
  await Promise.race([all, timeout]);
  clearTimeout(timer);
};
