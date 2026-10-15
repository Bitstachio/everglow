import { OnboardingDraftProvider } from "@/features/profile/onboarding-draft";
import { Stack } from "expo-router";

// Onboarding is complete by the photo step, so there is no swiping back to
// the name and username from there.
const OnboardingLayout = () => (
  <OnboardingDraftProvider>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="photo" options={{ gestureEnabled: false }} />
      <Stack.Screen name="crop" options={{ animation: "fade" }} />
      <Stack.Screen name="ready" options={{ gestureEnabled: false, animation: "fade" }} />
    </Stack>
  </OnboardingDraftProvider>
);

export default OnboardingLayout;
