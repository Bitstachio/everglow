import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Auth0Provider } from "react-native-auth0";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AuthProvider } from "@/context/auth-context";
import { queryClient } from "@/lib/query/client";
import "./global.css";

const AUTH0_DOMAIN = process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? "";
const AUTH0_CLIENT_ID = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID ?? "";

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <Auth0Provider domain={AUTH0_DOMAIN} clientId={AUTH0_CLIENT_ID}>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
            <Stack>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen name="signup" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="events/create" options={{ title: "Create Event", headerBackTitle: "Back" }} />
              <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
            </Stack>
            <StatusBar style="auto" />
          </ThemeProvider>
        </QueryClientProvider>
      </AuthProvider>
    </Auth0Provider>
  );
}
