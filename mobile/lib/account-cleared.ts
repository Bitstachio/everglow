/**
 * State that lives outside React Query, such as a roll's upload tray, registers
 * here to be dropped when the account on this phone is cleared (sign-out, an
 * expired session, a deleted account). The auth context runs them.
 */
const handlers = new Set<() => void>();

export const onAccountCleared = (handler: () => void) => {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
};

export const runAccountCleared = () => handlers.forEach((handler) => handler());
