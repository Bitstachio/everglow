import Auth0 from "react-native-auth0";
import * as WebBrowser from "expo-web-browser";

export { isDatabaseIdentity } from "./auth0-identity";

const AUTH0_DOMAIN = process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? "";
const AUTH0_CLIENT_ID = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID ?? "";
const AUTH0_AUDIENCE = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE ?? "";

// Must match the `customScheme` configured in the react-native-auth0 Expo
// config plugin (see app.config.ts) and the app `scheme` in app.json.
export const AUTH0_CUSTOM_SCHEME = "everglowmobile";

// Return URL for openAuthSessionAsync. List on Allowed Callback URLs. Not sent
// as Auth0 ticket result_url (New Universal Login forbids that with client_id).
export const PASSWORD_CHANGE_RESULT_URL =
  process.env.EXPO_PUBLIC_AUTH0_PASSWORD_CHANGE_RESULT_URL ?? `${AUTH0_CUSTOM_SCHEME}://password-change/result`;

// `offline_access` is required for the credentials manager to obtain a refresh
// token and silently renew the access token after it expires.
export const AUTH0_SCOPE = "openid profile email offline_access";

// Single shared client. Its native credentials manager is a process-wide
// singleton, so tokens saved here are also visible to the Auth0Provider.
export const auth0 = new Auth0({ domain: AUTH0_DOMAIN, clientId: AUTH0_CLIENT_ID });

export const isAuth0Configured = (): boolean => {
  return Boolean(AUTH0_DOMAIN && AUTH0_CLIENT_ID && AUTH0_AUDIENCE);
};

export const isUserCancellation = (error: unknown): boolean => {
  const err = error as { code?: string; name?: string; message?: string } | undefined;
  if (!err) return false;
  return err.code === "USER_CANCELLED" || err.code === "a0.session.user_cancelled" || /cancel/i.test(err.message ?? "");
};

/**
 * Launch Auth0 Universal Login. Pass `signup: true` to land users on the
 * sign-up screen. On success the credentials are persisted in the native
 * credentials manager.
 */
export const loginWithUniversalLogin = async (options?: { signup?: boolean }): Promise<void> => {
  const credentials = await auth0.webAuth.authorize(
    {
      scope: AUTH0_SCOPE,
      audience: AUTH0_AUDIENCE,
      ...(options?.signup ? { additionalParameters: { screen_hint: "signup" } } : {}),
    },
    { customScheme: AUTH0_CUSTOM_SCHEME },
  );

  await auth0.credentialsManager.saveCredentials(credentials);
};

/** Clear the Auth0 web session and locally stored credentials. */
export const logoutFromAuth0 = async (): Promise<void> => {
  try {
    await auth0.webAuth.clearSession(undefined, { customScheme: AUTH0_CUSTOM_SCHEME });
  } finally {
    await clearLocalCredentials();
  }
};

/**
 * Return a valid access token, transparently refreshing it via the stored
 * refresh token when expired. Returns null when there is no usable session.
 */
export const getAccessToken = async (): Promise<string | null> => {
  try {
    const hasValid = await auth0.credentialsManager.hasValidCredentials();
    if (!hasValid) return null;
    const credentials = await auth0.credentialsManager.getCredentials();
    return credentials?.accessToken ?? null;
  } catch {
    return null;
  }
};

export const hasValidSession = async (): Promise<boolean> => {
  try {
    return await auth0.credentialsManager.hasValidCredentials();
  } catch {
    return false;
  }
};

export const clearLocalCredentials = async (): Promise<void> => {
  try {
    await auth0.credentialsManager.clearCredentials();
  } catch {
    // No credentials to clear.
  }
};

/**
 * Open an Auth0 password-change ticket in the system auth browser
 * (ASWebAuthenticationSession / Chrome Custom Tabs) — the same class Universal
 * Login uses. Not a WebView.
 */
export const openPasswordChangeTicket = async (ticketUrl: string): Promise<WebBrowser.WebBrowserAuthSessionResult> => {
  return WebBrowser.openAuthSessionAsync(ticketUrl, PASSWORD_CHANGE_RESULT_URL);
};

/**
 * After a password change the refresh token is often revoked. Returns false when
 * the local session can no longer be refreshed; callers should clear credentials
 * and send the user to login.
 */
export const sessionStillValid = async (): Promise<boolean> => {
  try {
    const hasValid = await auth0.credentialsManager.hasValidCredentials();
    if (!hasValid) return false;
    await auth0.credentialsManager.getCredentials();
    return true;
  } catch {
    return false;
  }
};
