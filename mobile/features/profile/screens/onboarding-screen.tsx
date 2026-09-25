import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, Pressable, ScrollView } from "react-native";
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
    acceptedTerms,
    availability,
    usernameFieldError,
    canContinue,
    setName,
    setUsername,
    toggleAcceptedTerms,
    openTermsOfUse,
    openPrivacyPolicy,
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
            <View style={styles.consentRow}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acceptedTerms }}
                accessibilityLabel="I agree to the Terms of Use and Privacy Policy"
                onPress={toggleAcceptedTerms}
                hitSlop={8}
                style={[
                  styles.checkbox,
                  isDark ? styles.checkboxDark : styles.checkboxLight,
                  acceptedTerms && (isDark ? styles.checkboxCheckedDark : styles.checkboxCheckedLight),
                ]}
              >
                {acceptedTerms ? <Text style={styles.checkmark}>✓</Text> : null}
              </Pressable>
              <Text style={[styles.consentText, isDark ? styles.subtitleDark : styles.subtitleLight]}>
                I agree to the{" "}
                <Text
                  accessibilityRole="link"
                  onPress={openTermsOfUse}
                  style={[styles.link, isDark ? styles.linkDark : styles.linkLight]}
                >
                  Terms of Use
                </Text>{" "}
                and{" "}
                <Text
                  accessibilityRole="link"
                  onPress={openPrivacyPolicy}
                  style={[styles.link, isDark ? styles.linkDark : styles.linkLight]}
                >
                  Privacy Policy
                </Text>
                , including no objectionable content or abusive behaviour.
              </Text>
            </View>
            {formErrors.terms ? <Text style={styles.consentError}>{formErrors.terms}</Text> : null}
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
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxLight: {
    borderColor: "#9CA3AF",
  },
  checkboxDark: {
    borderColor: "#6B7280",
  },
  checkboxCheckedLight: {
    backgroundColor: "#4F46E5",
    borderColor: "#4F46E5",
  },
  checkboxCheckedDark: {
    backgroundColor: "#818CF8",
    borderColor: "#818CF8",
  },
  checkmark: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  consentText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  link: {
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  linkLight: {
    color: "#4F46E5",
  },
  linkDark: {
    color: "#818CF8",
  },
  consentError: {
    color: "#DC2626",
    fontSize: 14,
    marginTop: -4,
  },
});
