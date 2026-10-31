/**
 * State that lives outside React Query, such as a roll's upload tray, registers
 * here to be dropped when the account on this phone is cleared. The auth
 * context runs them.
 *
 * - signedOut: a deliberate sign-out or a deleted account; nothing may remain
 * - sessionExpired: the session ended on its own; stop work in memory, but the
 *   same person can sign back in and pick up what was left on this phone
 */
export type AccountClearedReason = "signedOut" | "sessionExpired";

const handlers = new Set<(reason: AccountClearedReason) => void>();

export const onAccountCleared = (handler: (reason: AccountClearedReason) => void) => {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
};

export const runAccountCleared = (reason: AccountClearedReason) => handlers.forEach((handler) => handler(reason));
