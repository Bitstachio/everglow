import { getErrorMessage } from "@/lib/api/errors";
import { isAuth0DbConnectionConfigured, requestPasswordReset } from "@/lib/auth0";
import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { validateForgotPasswordEmail } from "../forgot-password";

export type ForgotPasswordDeps = {
  isDbConfigured?: () => boolean;
  resetPassword?: (email: string) => Promise<void>;
};

export const useForgotPassword = (deps: ForgotPasswordDeps = {}) => {
  const isDbConfigured = deps.isDbConfigured ?? isAuth0DbConnectionConfigured;
  const resetPassword = deps.resetPassword ?? requestPasswordReset;

  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openForgotPassword = useCallback(() => {
    if (!isDbConfigured()) {
      Alert.alert(
        "Password reset unavailable",
        "The Auth0 database connection is not configured for this build.",
      );
      return;
    }
    setEmail("");
    setError(null);
    setVisible(true);
  }, [isDbConfigured]);

  const closeForgotPassword = useCallback(() => {
    if (isSubmitting) return;
    setVisible(false);
    setError(null);
  }, [isSubmitting]);

  const submitForgotPassword = useCallback(async () => {
    const parsed = validateForgotPasswordEmail(email);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await resetPassword(parsed.email);
      setVisible(false);
      Alert.alert("Check your email", "If an account exists for that address, Auth0 sent a reset link.");
    } catch (err) {
      setError(getErrorMessage(err, "Could not send a reset link. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }, [email, resetPassword]);

  return {
    visible,
    email,
    error,
    isSubmitting,
    openForgotPassword,
    closeForgotPassword,
    setEmail,
    submitForgotPassword,
  };
};
