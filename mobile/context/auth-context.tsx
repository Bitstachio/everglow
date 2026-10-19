import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { CantConnectScreen } from "@/components/cant-connect-screen";
import { LaunchCurtain, LaunchScreen } from "@/components/launch-screen";
import i18n from "@/i18n/instance";
import { router } from "expo-router";
import { authService, OnboardingData, User } from "@/lib/auth";
import { setSuspendedHandler, setUnauthorizedHandler } from "@/lib/api/axios-instance";
import { isConnectionError } from "@/lib/api/errors";
import { View } from "react-native";
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
  /** Suspended by the platform: the account can only read and delete itself (14.13). */
  isSuspended: boolean;
  login: () => Promise<void>;
  signup: () => Promise<void>;
  /** Signs out and goes to `to`, the welcome by default. */
  logout: (to?: SignedOutRoute) => Promise<void>;
  completeOnboarding: (data: OnboardingData) => Promise<void>;
  refreshProfile: () => Promise<User | null>;
  updateUser: (user: User) => void;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const EVENTS_ROUTE = "/events" as const;
const ONBOARDING_ROUTE = "/onboarding" as const;
const LOGIN_ROUTE = "/login" as const;
const SUSPENDED_ROUTE = "/account-suspended" as const;

/** Where signing out lands: the welcome, or Deleted (14.12) after deleting the account. */
type SignedOutRoute = typeof LOGIN_ROUTE | "/account-deleted";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The step that couldn't reach Everglow (01.7), repeated by Try again.
  const [pendingStep, setPendingStep] = useState<(() => Promise<User | null>) | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Avoid stale closures when the 401 handler is invoked from the interceptor.
  const handleSessionExpiredRef = useRef<() => void>(() => {});
  // Set by a deliberate sign-out until the next sign-in. A deleted account's
  // token answers 401 at once, and a refetch racing the sign-out must not turn
  // Deleted (14.12) into the signed-out welcome.
  const signedOutRef = useRef(false);
  const userRef = useRef<User | null>(null);
  const checkingSuspensionRef = useRef(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const routeForUser = useCallback((profile: User | null) => {
    if (!profile) {
      router.replace(LOGIN_ROUTE);
      return;
    }
    if (profile.suspendedAt) {
      router.replace(SUSPENDED_ROUTE);
      return;
    }
    router.replace(profile.isOnboarded ? EVENTS_ROUTE : ONBOARDING_ROUTE);
  }, []);

  const refreshProfile = useCallback(async (): Promise<User | null> => {
    const profile = await authService.getUserProfile();
    setUser(profile);
    return profile;
  }, []);

  const handleSessionExpired = useCallback(async () => {
    if (signedOutRef.current) return;
    await clearLocalCredentials();
    setUser(null);
    // The welcome shows the signed-out slip (01.8) instead of a blank start.
    router.replace({ pathname: LOGIN_ROUTE, params: { signedOut: "1" } });
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

  // A suspension that starts mid-session: requests start answering
  // ACCOUNT_SUSPENDED, so reload the account once and land on 14.13.
  const handleSuspended = useCallback(async () => {
    if (checkingSuspensionRef.current || !userRef.current || userRef.current.suspendedAt) return;
    checkingSuspensionRef.current = true;
    try {
      const profile = await refreshProfile();
      if (profile?.suspendedAt) router.replace(SUSPENDED_ROUTE);
    } catch {
      // The next refused request checks again.
    } finally {
      checkingSuspensionRef.current = false;
    }
  }, [refreshProfile]);

  useEffect(() => {
    setSuspendedHandler(() => void handleSuspended());
    return () => setSuspendedHandler(null);
  }, [handleSuspended]);

  const loadSession = useCallback(async (): Promise<User | null> => {
    if (isAuth0Configured() && (await hasValidSession())) {
      return refreshProfile();
    }
    return null;
  }, [refreshProfile]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await loadSession();
      } catch (err) {
        if (isConnectionError(err)) {
          // Keep the session; the person can retry once they're back online.
          setPendingStep(() => loadSession);
        } else {
          console.error("Auth bootstrap error:", err);
          setUser(null);
        }
      } finally {
        setIsLoading(false);
        setIsInitialized(true);
      }
    };
    void bootstrap();
  }, [loadSession]);

  const retryConnection = useCallback(async () => {
    if (!pendingStep) return;
    setIsRetrying(true);
    try {
      const profile = await pendingStep();
      setPendingStep(null);
      if (profile) routeForUser(profile);
    } catch (err) {
      if (!isConnectionError(err)) setPendingStep(null);
    } finally {
      setIsRetrying(false);
    }
  }, [pendingStep, routeForUser]);

  const authenticate = useCallback(
    async (options?: { signup?: boolean }) => {
      if (!isAuth0Configured()) {
        const message = i18n.t("auth.notConfigured", { ns: "common" });
        setError(message);
        throw new Error(message);
      }

      try {
        setIsLoading(true);
        setError(null);
        signedOutRef.current = false;
        await loginWithUniversalLogin(options);
        let profile: User | null;
        try {
          profile = await refreshProfile();
        } catch (err) {
          if (isConnectionError(err)) {
            setPendingStep(() => refreshProfile);
            return;
          }
          throw err;
        }
        routeForUser(profile);
      } catch (err: any) {
        if (isUserCancellation(err)) {
          return;
        }
        const message = err?.message || i18n.t("auth.failed", { ns: "common" });
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
      // The caller goes on to the rest of onboarding (the photo step).
      setUser(profile);
    } catch (err: any) {
      const message = err?.message || i18n.t("auth.onboardingFailed", { ns: "common" });
      setError(message);
      // Keep the API error so the caller can read its code (USERNAME_TAKEN).
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async (to: SignedOutRoute = LOGIN_ROUTE) => {
    signedOutRef.current = true;
    try {
      setIsLoading(true);
      await logoutFromAuth0();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setUser(null);
      setIsLoading(false);
      router.replace(to);
    }
  }, []);

  const updateUser = useCallback((updatedUser: User) => setUser(updatedUser), []);
  const clearError = useCallback(() => setError(null), []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    isOnboarded: !!user?.isOnboarded,
    isSuspended: !!user?.suspendedAt,
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
    return <LaunchScreen />;
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
      <LaunchCurtain />
      {pendingStep ? (
        <View className="absolute inset-0">
          <CantConnectScreen onRetry={() => void retryConnection()} isRetrying={isRetrying} />
        </View>
      ) : null}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
