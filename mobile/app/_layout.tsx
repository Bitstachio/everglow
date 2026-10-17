import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { Auth0Provider } from "react-native-auth0";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { I18nProvider } from "@/providers/i18n-provider";
import { QueryProvider } from "@/providers/query-provider";
import { AppThemeProvider } from "@/theme/provider";
import "./global.css";

// The native splash stays up until the launch screen, which looks identical,
// has painted (components/launch-screen.tsx), so the hand-off has no gap.
void SplashScreen.preventAutoHideAsync();

const AUTH0_DOMAIN = process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? "";
const AUTH0_CLIENT_ID = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID ?? "";

const RootLayout = () => (
  <I18nProvider>
    <Auth0Provider domain={AUTH0_DOMAIN} clientId={AUTH0_CLIENT_ID}>
      <AuthProvider>
        <QueryProvider>
          <AppThemeProvider>
            <RootNavigator />
            <StatusBar style="light" />
          </AppThemeProvider>
        </QueryProvider>
      </AuthProvider>
    </Auth0Provider>
  </I18nProvider>
);

export default RootLayout;

const RootNavigator = () => {
  const { isAuthenticated, isOnboarded } = useAuth();
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
      <Stack.Protected guard={isAuthenticated && isOnboarded}>
        <Stack.Screen name="events/index" options={{ headerShown: false, animation: "fade" }} />
        {/* Chapter 14, You: each screen draws its own top bar. */}
        <Stack.Screen name="account-settings" options={{ headerShown: false }} />
        <Stack.Screen name="edit-card" options={{ headerShown: false }} />
        <Stack.Screen name="edit-username" options={{ headerShown: false }} />
        <Stack.Screen name="password" options={{ headerShown: false }} />
        <Stack.Screen name="events/list" options={{ title: t("screens.myEvents"), headerBackTitle: backTitle }} />
        <Stack.Screen name="events/create" options={{ title: t("screens.createEvent"), headerBackTitle: backTitle }} />
        <Stack.Screen name="events/[id]/index" />
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
