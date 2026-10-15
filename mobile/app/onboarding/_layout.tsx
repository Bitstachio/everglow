import { OnboardingDraftProvider } from "@/features/profile/onboarding-draft";
import { Stack } from "expo-router";

const OnboardingLayout = () => (
  <OnboardingDraftProvider>
    <Stack screenOptions={{ headerShown: false }} />
  </OnboardingDraftProvider>
);

export default OnboardingLayout;
