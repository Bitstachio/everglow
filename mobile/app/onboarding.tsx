import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { useAuth0 } from "react-native-auth0";
import { useAuth } from "@/context/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function OnboardingScreen() {
  const { completeOnboarding, isLoading, error, clearError, isAuthenticated, isOnboarded } = useAuth();
  const { user: auth0User } = useAuth0();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [formErrors, setFormErrors] = useState({ name: "", email: "" });

  // Prefill from the Auth0 ID token when available.
  useEffect(() => {
    if (auth0User?.name) setName((prev) => prev || auth0User.name || "");
    if (auth0User?.email) setEmail((prev) => prev || auth0User.email || "");
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
      router.replace("/(tabs)/gallery");
    }
  }, [isAuthenticated, isOnboarded]);

  const validateForm = () => {
    const errors = { name: "", email: "" };
    let isValid = true;

    if (!name.trim()) {
      errors.name = "Name is required";
      isValid = false;
    } else if (name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters";
      isValid = false;
    }

    if (!email.trim()) {
      errors.email = "Email is required";
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      errors.email = "Email is invalid";
      isValid = false;
    }

    setFormErrors(errors);
    return isValid;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      await completeOnboarding({ name: name.trim(), email: email.trim() });
    } catch (err: any) {
      Alert.alert("Onboarding Failed", err.message || "Please try again");
    }
  };

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
              label="Email"
              placeholder="Enter your email"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (formErrors.email) setFormErrors({ ...formErrors, email: "" });
                if (error) clearError();
              }}
              error={formErrors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <Button title="Continue" onPress={handleSubmit} isLoading={isLoading} disabled={isLoading} />
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
  },
});
