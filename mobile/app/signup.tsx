import React, { useEffect } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Alert } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function SignupScreen() {
  const { signup, isLoading, error, clearError, isAuthenticated, isOnboarded } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(isOnboarded ? "/(tabs)/gallery" : "/onboarding");
    }
  }, [isAuthenticated, isOnboarded]);

  const handleSignup = async () => {
    try {
      await signup();
    } catch (err: any) {
      Alert.alert("Signup Failed", err.message || "Please try again");
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.content, isDark ? styles.contentDark : styles.contentLight]}>
          <View style={styles.header}>
            <Text style={[styles.title, isDark ? styles.titleDark : styles.titleLight]}>Create Account</Text>
            <Text style={[styles.subtitle, isDark ? styles.subtitleDark : styles.subtitleLight]}>
              Sign up to get started
            </Text>
          </View>
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          <View style={styles.form}>
            <Button title="Sign Up" onPress={handleSignup} isLoading={isLoading} disabled={isLoading} />
          </View>
          <View style={styles.footer}>
            <Text style={[styles.footerText, isDark ? styles.footerTextDark : styles.footerTextLight]}>
              Already have an account?{" "}
            </Text>
            <TouchableOpacity onPress={() => router.push("/login")} disabled={isLoading}>
              <Text style={[styles.link, isDark ? styles.linkDark : styles.linkLight]}>Sign In</Text>
            </TouchableOpacity>
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
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: {
    fontSize: 14,
  },
  footerTextLight: {
    color: "#6B7280",
  },
  footerTextDark: {
    color: "#9CA3AF",
  },
  link: {
    fontSize: 14,
    fontWeight: "600",
  },
  linkLight: {
    color: "#6366F1",
  },
  linkDark: {
    color: "#818CF8",
  },
});
