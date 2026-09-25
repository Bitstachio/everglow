import { getErrorCode, getErrorMessage, isApiError } from "@/lib/api/errors";
import { useAuth } from "@/context/auth-context";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { useAuth0 } from "react-native-auth0";
import { isUsernameFormatValid, normalizeUsername, usernameAvailabilityMessage } from "../lib/username";
import { useUsernameAvailability } from "./use-username-availability";

export const useOnboardingScreen = () => {
  const { completeOnboarding, isLoading, error, clearError, isAuthenticated, isOnboarded } = useAuth();
  const { user: auth0User } = useAuth0();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [formErrors, setFormErrors] = useState({ name: "", username: "" });
  const availability = useUsernameAvailability(username);

  useEffect(() => {
    if (auth0User?.name) setName((prev) => prev || auth0User.name || "");
  }, [auth0User]);

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    } else if (isOnboarded) {
      router.replace("/events");
    }
  }, [isAuthenticated, isOnboarded]);

  const validateForm = () => {
    const errors = { name: "", username: "" };
    let isValid = true;
    const normalizedUsername = normalizeUsername(username);

    if (!name.trim()) {
      errors.name = "Name is required";
      isValid = false;
    } else if (name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters";
      isValid = false;
    }

    if (!normalizedUsername) {
      errors.username = "Username is required";
      isValid = false;
    } else if (!isUsernameFormatValid(normalizedUsername)) {
      errors.username = usernameAvailabilityMessage("INVALID_FORMAT") ?? "Invalid username";
      isValid = false;
    } else if (!availability.canSubmit) {
      errors.username = availability.message ?? "Username is not available";
      isValid = false;
    }

    setFormErrors(errors);
    return isValid;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    const normalizedUsername = normalizeUsername(username);

    try {
      await completeOnboarding({ name: name.trim(), username: normalizedUsername });
    } catch (err: unknown) {
      if (getErrorCode(err) === "USERNAME_TAKEN") {
        setFormErrors((prev) => ({
          ...prev,
          username: usernameAvailabilityMessage("TAKEN") ?? "This username is taken",
        }));
        return;
      }
      if (isApiError(err) && err.status === 400) {
        setFormErrors((prev) => ({
          ...prev,
          username: getErrorMessage(err, usernameAvailabilityMessage("INVALID_FORMAT") ?? "Invalid username"),
        }));
        return;
      }
      Alert.alert("Onboarding Failed", getErrorMessage(err, "Please try again"));
    }
  };

  const usernameFieldError =
    formErrors.username ||
    (availability.status === "unavailable" || availability.status === "paused" ? (availability.message ?? "") : "");
  const canContinue = !isLoading && availability.canSubmit && name.trim().length >= 2;

  return {
    name,
    username,
    formErrors,
    error,
    isLoading,
    availability,
    usernameFieldError,
    canContinue,
    setName: (text: string) => {
      setName(text);
      if (formErrors.name) setFormErrors({ ...formErrors, name: "" });
      if (error) clearError();
    },
    setUsername: (text: string) => {
      setUsername(text);
      if (formErrors.username) setFormErrors({ ...formErrors, username: "" });
      if (error) clearError();
    },
    handleSubmit,
  };
};
