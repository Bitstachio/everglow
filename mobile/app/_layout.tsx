import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { I18nProvider } from "@/providers/i18n-provider";
import { QueryProvider } from "@/providers/query-provider";
import { AppThemeProvider } from "@/theme/provider";
import "./global.css";

// The native splash stays up until the launch screen, which looks identical,
// has painted (components/launch-screen.tsx), so the hand-off has no gap.
void SplashScreen.preventAutoHideAsync();

const RootLayout = () => (
  <I18nProvider>
    {/* Above AuthProvider, which clears the cache whenever the account signs out. */}
    <QueryProvider>
      <AuthProvider>
        <AppThemeProvider>
          <RootNavigator />
          <StatusBar style="light" />
        </AppThemeProvider>
      </AuthProvider>
    </QueryProvider>
  </I18nProvider>
);

export default RootLayout;

const RootNavigator = () => {
  const { isAuthenticated, isOnboarded, isSuspended } = useAuth();
  const { t } = useTranslation("common");
  const backTitle = t("actions.back");

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* The first screen after launch fades in; a redirect would otherwise slide it in like a push. */}
      <Stack.Screen name="login" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="privacy-policy" options={{ title: t("screens.privacyPolicy"), headerBackTitle: backTitle }} />
      <Stack.Screen name="terms-of-use" options={{ title: t("screens.termsOfUse"), headerBackTitle: backTitle }} />
      <Stack.Screen name="design-kit" options={{ headerShown: false }} />
      {/* 14.12: shown once the account is gone and its session cleared. */}
      <Stack.Screen name="account-deleted" options={{ headerShown: false, animation: "fade", gestureEnabled: false }} />
      {/* 06.3: an invite opens here signed out too, sealed until sign-in. */}
      <Stack.Screen name="join/[token]" options={{ headerShown: false }} />
      {/* A suspended account can still delete itself (14.13 → 14.11). */}
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="delete-account" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated && isSuspended}>
        <Stack.Screen name="account-suspended" options={{ headerShown: false, animation: "fade" }} />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated && isOnboarded && !isSuspended}>
        <Stack.Screen name="events/index" options={{ headerShown: false, animation: "fade" }} />
        {/* Chapter 14, You: each screen draws its own top bar. */}
        <Stack.Screen name="account-settings" options={{ headerShown: false }} />
        <Stack.Screen name="edit-card" options={{ headerShown: false }} />
        <Stack.Screen name="edit-username" options={{ headerShown: false }} />
        <Stack.Screen name="password" options={{ headerShown: false }} />
        <Stack.Screen name="blocked-people" options={{ headerShown: false }} />
        <Stack.Screen name="events/list" options={{ title: t("screens.myEvents"), headerBackTitle: backTitle }} />
        <Stack.Screen name="events/create" options={{ title: t("screens.createEvent"), headerBackTitle: backTitle }} />
        {/* Chapter 06, Join: the scanner. The envelope is above, open to everyone. */}
        <Stack.Screen name="join/index" options={{ headerShown: false }} />
        <Stack.Screen name="events/[id]/index" options={{ headerShown: false }} />
        {/* Chapter 05: the envelope draws its own top bar. */}
        <Stack.Screen name="events/[id]/envelope" options={{ headerShown: false }} />
        {/* 08.3: the tray draws its own top bar. */}
        <Stack.Screen name="events/[id]/tray" options={{ headerShown: false }} />
        <Stack.Screen
          name="events/[id]/settings"
          options={{ title: t("screens.eventSettings"), headerBackTitle: backTitle }}
        />
        <Stack.Screen
          name="events/[id]/edit-title"
          options={{ title: t("screens.editTitle"), headerBackTitle: backTitle }}
        />
        <Stack.Screen
          name="events/[id]/edit-description"
          options={{ title: t("screens.editDescription"), headerBackTitle: backTitle }}
        />
        <Stack.Screen
          name="events/[id]/edit-date"
          options={{ title: t("screens.editDate"), headerBackTitle: backTitle }}
        />
      </Stack.Protected>
    </Stack>
  );
};
