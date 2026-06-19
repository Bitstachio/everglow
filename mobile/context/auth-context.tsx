import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { router } from "expo-router";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { authService, OnboardingData, User } from "@/lib/auth";
import { setUnauthorizedHandler } from "@/lib/api";
import {
  clearLocalCredentials,
  hasValidSession,
  isAuth0Configured,
  isUserCancellation,
  loginWithUniversalLogin,
  logoutFromAuth0,
} from "@/lib/auth0";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  login: () => Promise<void>;
  signup: () => Promise<void>;
  logout: () => Promise<void>;
  completeOnboarding: (data: OnboardingData) => Promise<void>;
  refreshProfile: () => Promise<User | null>;
  updateUser: (user: User) => void;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const GALLERY_ROUTE = "/(tabs)/gallery" as const;
const ONBOARDING_ROUTE = "/onboarding" as const;
const LOGIN_ROUTE = "/login" as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Avoid stale closures when the 401 handler is invoked from the interceptor.
  const handleSessionExpiredRef = useRef<() => void>(() => {});

  const routeForUser = useCallback((profile: User | null) => {
    if (!profile) {
      router.replace(LOGIN_ROUTE);
      return;
    }
    router.replace(profile.isOnboarded ? GALLERY_ROUTE : ONBOARDING_ROUTE);
  }, []);

  const refreshProfile = useCallback(async (): Promise<User | null> => {
    const profile = await authService.getUserProfile();
    setUser(profile);
    return profile;
  }, []);

  const handleSessionExpired = useCallback(async () => {
    await clearLocalCredentials();
    setUser(null);
    router.replace(LOGIN_ROUTE);
  }, []);

  useEffect(() => {
    handleSessionExpiredRef.current = () => {
      void handleSessionExpired();
    };
  }, [handleSessionExpired]);

  useEffect(() => {
    setUnauthorizedHandler(() => handleSessionExpiredRef.current());
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        if (isAuth0Configured() && (await hasValidSession())) {
          await refreshProfile();
        }
      } catch (err) {
        console.error("Auth bootstrap error:", err);
        setUser(null);
      } finally {
        setIsLoading(false);
        setIsInitialized(true);
      }
    };
    void bootstrap();
  }, [refreshProfile]);

  const authenticate = useCallback(
    async (options?: { signup?: boolean }) => {
      if (!isAuth0Configured()) {
        const message =
          "Auth0 is not configured. Set EXPO_PUBLIC_AUTH0_DOMAIN, EXPO_PUBLIC_AUTH0_CLIENT_ID and EXPO_PUBLIC_AUTH0_AUDIENCE.";
        setError(message);
        throw new Error(message);
      }

      try {
        setIsLoading(true);
        setError(null);
        await loginWithUniversalLogin(options);
        const profile = await refreshProfile();
        routeForUser(profile);
      } catch (err: any) {
        if (isUserCancellation(err)) {
          return;
        }
        const message = err?.message || "Authentication failed. Please try again.";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [refreshProfile, routeForUser],
  );

  const login = useCallback(() => authenticate(), [authenticate]);
  const signup = useCallback(() => authenticate({ signup: true }), [authenticate]);

  const completeOnboarding = useCallback(async (data: OnboardingData) => {
    try {
      setIsLoading(true);
      setError(null);
      const profile = await authService.completeOnboarding(data);
      setUser(profile);
      router.replace(GALLERY_ROUTE);
    } catch (err: any) {
      const message = err?.message || "Could not complete onboarding.";
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      setIsLoading(true);
      await logoutFromAuth0();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setUser(null);
      setIsLoading(false);
      router.replace(LOGIN_ROUTE);
    }
  }, []);

  const updateUser = useCallback((updatedUser: User) => setUser(updatedUser), []);
  const clearError = useCallback(() => setError(null), []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    isOnboarded: !!user?.isOnboarded,
    login,
    signup,
    logout,
    completeOnboarding,
    refreshProfile,
    updateUser,
    error,
    clearError,
  };

  if (!isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
});
