import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Auth0Provider } from "react-native-auth0";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { QueryProvider } from "@/providers/query-provider";
import { AppThemeProvider } from "@/theme/provider";
import "./global.css";

const AUTH0_DOMAIN = process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? "";
const AUTH0_CLIENT_ID = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID ?? "";

const RootLayout = () => (
  <Auth0Provider domain={AUTH0_DOMAIN} clientId={AUTH0_CLIENT_ID}>
    <AuthProvider>
      <QueryProvider>
        <AppThemeProvider>
          <RootNavigator />
          <StatusBar style="auto" />
        </AppThemeProvider>
      </QueryProvider>
    </AuthProvider>
  </Auth0Provider>
);

export default RootLayout;

const RootNavigator = () => {
  const { isAuthenticated, isOnboarded } = useAuth();

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Protected guard={isAuthenticated && isOnboarded}>
        <Stack.Screen name="events/index" options={{ headerShown: false }} />
        <Stack.Screen
          name="account-settings"
          options={{ title: "Account Settings", headerBackTitle: "Back" }}
        />
        <Stack.Screen
          name="events/create"
          options={{ title: "Create Event", headerBackTitle: "Back" }}
        />
        <Stack.Screen name="events/[id]" />
        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Modal" }}
        />
      </Stack.Protected>
    </Stack>
  );
};