import { router, useLocalSearchParams } from "expo-router";

/**
 * 14.12 Deleted: the session is already cleared, so the only way is back to
 * the welcome. A Sign in with Apple account is told where to remove Everglow
 * from its Apple ID, in case the API could not revoke the token.
 */
export const useAccountDeletedScreen = () => {
  const { apple } = useLocalSearchParams<{ apple?: string }>();
  return {
    showAppleNote: apple === "1",
    onStart: () => router.replace("/login"),
  };
};
