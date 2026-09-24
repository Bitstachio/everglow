import { getErrorMessage } from "@/lib/api/errors";
import { isDatabaseIdentity } from "@/lib/auth0-identity";
import {
  clearLocalCredentials,
  openPasswordChangeTicket,
  sessionStillValid,
} from "@/lib/auth0";
import { useAuth0 } from "react-native-auth0";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { useCreatePasswordChangeTicketMutation } from "../api/mutations";

const LOGIN_ROUTE = "/login" as const;

/**
 * Signed-in password change: mint a ticket from the API, open Auth0's hosted
 * page in the system auth browser, then revalidate the local session. A password
 * change often revokes the refresh token — when that happens we clear credentials
 * and send the user to login rather than trying to keep a dead session.
 */
export const useChangePassword = () => {
  const { user: auth0User } = useAuth0();
  const ticketMutation = useCreatePasswordChangeTicketMutation();
  const [isOpeningBrowser, setIsOpeningBrowser] = useState(false);
  const inFlight = useRef(false);

  const canChangePassword = isDatabaseIdentity(auth0User?.sub);
  const isChangingPassword = ticketMutation.isPending || isOpeningBrowser;

  const handleChangePassword = async () => {
    if (!canChangePassword || inFlight.current) return;
    inFlight.current = true;

    try {
      const { ticketUrl } = await ticketMutation.mutateAsync();
      setIsOpeningBrowser(true);
      await openPasswordChangeTicket(ticketUrl);

      const stillValid = await sessionStillValid();
      if (!stillValid) {
        await clearLocalCredentials();
        router.replace(LOGIN_ROUTE);
        return;
      }
    } catch (error) {
      Alert.alert("Could not change password", getErrorMessage(error, "Please try again."));
    } finally {
      setIsOpeningBrowser(false);
      inFlight.current = false;
    }
  };

  return {
    canChangePassword,
    isChangingPassword,
    handleChangePassword,
  };
};
