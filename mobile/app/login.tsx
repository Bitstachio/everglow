import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useColorScheme } from "@/hooks/use-color-scheme";

// same todo comments as signup.tsx
export default function LoginScreen() {
  const { signin, isLoading, error, clearError, isAuthenticated } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formErrors, setFormErrors] = useState({
    email: "",
    password: "",
  });

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/(tabs)/gallery");
    }
  }, [isAuthenticated]);

  const validateForm = () => {
    const errors = {
      email: "",
      password: "",
    };
    let isValid = true;

    if (!email.trim()) {
      errors.email = "Email is required";
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      errors.email = "Email is invalid";
      isValid = false;
    }

    if (!password) {
      errors.password = "Password is required";
      isValid = false;
    }

    setFormErrors(errors);
    return isValid;
  };

  const handleSignin = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      await signin({ email: email.trim(), password });
    } catch (err: any) {
      Alert.alert("Login Failed", err.message || "Please try again");
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.content, isDark ? styles.contentDark : styles.contentLight]}>
          <View style={styles.header}>
            <Text style={[styles.title, isDark ? styles.titleDark : styles.titleLight]}>Welcome Back</Text>
            <Text style={[styles.subtitle, isDark ? styles.subtitleDark : styles.subtitleLight]}>
              Sign in to continue
            </Text>
          </View>
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          <View style={styles.form}>
            <Input
              label="Email"
              placeholder="Enter your email"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (formErrors.email) {
                  setFormErrors({ ...formErrors, email: "" });
                }
                if (error) clearError();
              }}
              error={formErrors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <Input
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (formErrors.password) {
                  setFormErrors({ ...formErrors, password: "" });
                }
                if (error) clearError();
              }}
              error={formErrors.password}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
            />
            <Button title="Sign In" onPress={handleSignin} isLoading={isLoading} disabled={isLoading} />
          </View>
          <View style={styles.footer}>
            <Text style={[styles.footerText, isDark ? styles.footerTextDark : styles.footerTextLight]}>
              {"Don't have an account? "}
            </Text>
            <TouchableOpacity onPress={() => router.push("/signup")} disabled={isLoading}>
              <Text style={[styles.link, isDark ? styles.linkDark : styles.linkLight]}>Sign Up</Text>
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
