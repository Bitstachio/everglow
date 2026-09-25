import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { useAuth0 } from "react-native-auth0";
import { useAuth } from "@/context/auth-context";
import { Input } from "@/components/ui/input/input";
import { Button } from "@/components/ui/button";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ApiError, getErrorCode, getErrorMessage } from "@/lib/api/errors";
import { useUsernameAvailability } from "@/features/profile/hooks/use-username-availability";
import { isUsernameFormatValid, normalizeUsername, usernameAvailabilityMessage } from "@/features/profile/lib/username";

export default function OnboardingScreen() {
  const { completeOnboarding, isLoading, error, clearError, isAuthenticated, isOnboarded } = useAuth();
  const { user: auth0User } = useAuth0();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [formErrors, setFormErrors] = useState({ name: "", username: "" });
  const availability = useUsernameAvailability(username);

  // Prefill display name from the Auth0 ID token when available (token may arrive after first render).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time async Auth0 profile prefill */
    if (auth0User?.name) setName((prev) => prev || auth0User.name || "");
    /* eslint-enable react-hooks/set-state-in-effect */
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
      if (err instanceof ApiError && err.status === 400) {
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

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.content, isDark ? styles.contentDark : styles.contentLight]}>
          <View style={styles.header}>
            <Text style={[styles.title, isDark ? styles.titleDark : styles.titleLight]}>Finish setting up</Text>
            <Text style={[styles.subtitle, isDark ? styles.subtitleDark : styles.subtitleLight]}>
              Tell us how you&apos;d like to appear in Everglow
            </Text>
          </View>
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          <View style={styles.form}>
            <Input
              label="Full Name"
              placeholder="Enter your full name"
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (formErrors.name) setFormErrors({ ...formErrors, name: "" });
                if (error) clearError();
              }}
              error={formErrors.name}
              autoCapitalize="words"
              autoComplete="name"
            />
            <Input
              label="Username"
              accessibilityLabel="Username"
              placeholder="Enter your username"
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                if (formErrors.username) setFormErrors({ ...formErrors, username: "" });
                if (error) clearError();
              }}
              error={usernameFieldError}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
            />
            {availability.status === "checking" || availability.status === "available" ? (
              <Text
                style={[styles.availabilityHint, isDark ? styles.availabilityHintDark : styles.availabilityHintLight]}
                accessibilityLiveRegion="polite"
              >
                {availability.message}
              </Text>
            ) : null}
            <Button title="Continue" onPress={handleSubmit} isLoading={isLoading} disabled={!canContinue} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  contentLight: {
    backgroundColor: "#F9FAFB",
  },
  contentDark: {
    backgroundColor: "#111827",
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 8,
  },
  titleLight: {
    color: "#111827",
  },
  titleDark: {
    color: "#F9FAFB",
  },
  subtitle: {
    fontSize: 16,
  },
  subtitleLight: {
    color: "#6B7280",
  },
  subtitleDark: {
    color: "#9CA3AF",
  },
  errorContainer: {
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
  },
  form: {
    marginBottom: 24,
    gap: 12,
  },
  availabilityHint: {
    fontSize: 14,
    marginTop: -4,
  },
  availabilityHintLight: {
    color: "#6B7280",
  },
  availabilityHintDark: {
    color: "#9CA3AF",
  },
});
