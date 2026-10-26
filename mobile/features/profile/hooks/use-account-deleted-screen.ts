import { router } from "expo-router";

/** 14.12 Deleted: the session is already cleared, so the only way is back to the welcome. */
export const useAccountDeletedScreen = () => ({
  onStart: () => router.replace("/login"),
});
