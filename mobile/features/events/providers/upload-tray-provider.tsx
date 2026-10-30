import { useAuth } from "@/context/auth-context";
import { useEffect } from "react";
import { useRefreshRollAfterUpload } from "../api/mutations";
import { activateUploadTrays } from "../lib/upload-tray";

/** Restores local upload failures after authentication, independently of an event screen. */
export const UploadTrayProvider = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const refresh = useRefreshRollAfterUpload();
  useEffect(() => {
    if (userId) activateUploadTrays(userId, refresh);
  }, [userId, refresh]);
  return null;
};
