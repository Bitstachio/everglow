import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
import { isDatabaseIdentity } from "@/lib/auth0-identity";
import { openPasswordChangeTicket, sessionStillValid } from "@/lib/auth0";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { useCreatePasswordChangeTicketMutation } from "../api/mutations";

/**
 * Signed-in password change: mint a ticket from the API, open Auth0's hosted
 * page in the system auth browser, then revalidate the local session. A password
 * change often revokes the refresh token — when that happens the auth context
 * ends the session like a 401, clearing the account and its cache, rather than
 * trying to keep a dead session.
 */
export const useChangePassword = () => {
  const { identity, endExpiredSession } = useAuth();
  const ticketMutation = useCreatePasswordChangeTicketMutation();
  const [isOpeningBrowser, setIsOpeningBrowser] = useState(false);
  const inFlight = useRef(false);

  const canChangePassword = isDatabaseIdentity(identity?.sub);
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
        await endExpiredSession();
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
