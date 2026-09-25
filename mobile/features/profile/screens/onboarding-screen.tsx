import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Input } from "@/components/ui/input/input";
import { Button } from "@/components/ui/button";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useOnboardingScreen } from "../hooks/use-onboarding-screen";

const OnboardingScreen = () => {
  const {
    name,
    username,
    formErrors,
    error,
    isLoading,
    availability,
    usernameFieldError,
    canContinue,
    setName,
    setUsername,
    handleSubmit,
  } = useOnboardingScreen();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

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
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <View style={styles.form}>
            <Input
              label="Full Name"
              placeholder="Enter your full name"
              value={name}
              onChangeText={setName}
              error={formErrors.name}
              autoCapitalize="words"
              autoComplete="name"
            />
            <Input
              label="Username"
              accessibilityLabel="Username"
              placeholder="Enter your username"
              value={username}
              onChangeText={setUsername}
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
};

export default OnboardingScreen;

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
