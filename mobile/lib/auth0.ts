import Auth0 from "react-native-auth0";

const AUTH0_DOMAIN = process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? "";
const AUTH0_CLIENT_ID = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID ?? "";
const AUTH0_AUDIENCE = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE ?? "";

// Must match the `customScheme` configured in the react-native-auth0 Expo
// config plugin (see app.config.ts) and the app `scheme` in app.json.
export const AUTH0_CUSTOM_SCHEME = "everglowmobile";

// `offline_access` is required for the credentials manager to obtain a refresh
// token and silently renew the access token after it expires.
export const AUTH0_SCOPE = "openid profile email offline_access";

// Single shared client. Its native credentials manager is a process-wide
// singleton, so tokens saved here are also visible to the Auth0Provider.
export const auth0 = new Auth0({ domain: AUTH0_DOMAIN, clientId: AUTH0_CLIENT_ID });

export function isAuth0Configured(): boolean {
  return Boolean(AUTH0_DOMAIN && AUTH0_CLIENT_ID && AUTH0_AUDIENCE);
}

export function isUserCancellation(error: unknown): boolean {
  const err = error as { code?: string; name?: string; message?: string } | undefined;
  if (!err) return false;
  return (
    err.code === "USER_CANCELLED" ||
    err.code === "a0.session.user_cancelled" ||
    /cancel/i.test(err.message ?? "")
  );
}

/**
 * Launch Auth0 Universal Login. Pass `signup: true` to land users on the
 * sign-up screen. On success the credentials are persisted in the native
 * credentials manager.
 */
export async function loginWithUniversalLogin(options?: { signup?: boolean }): Promise<void> {
  const credentials = await auth0.webAuth.authorize(
    {
      scope: AUTH0_SCOPE,
      audience: AUTH0_AUDIENCE,
      ...(options?.signup ? { additionalParameters: { screen_hint: "signup" } } : {}),
    },
    { customScheme: AUTH0_CUSTOM_SCHEME },
  );

  await auth0.credentialsManager.saveCredentials(credentials);
}

/** Clear the Auth0 web session and locally stored credentials. */
export async function logoutFromAuth0(): Promise<void> {
  try {
    await auth0.webAuth.clearSession(undefined, { customScheme: AUTH0_CUSTOM_SCHEME });
  } finally {
    await clearLocalCredentials();
  }
}

/**
 * Return a valid access token, transparently refreshing it via the stored
 * refresh token when expired. Returns null when there is no usable session.
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const hasValid = await auth0.credentialsManager.hasValidCredentials();
    if (!hasValid) return null;
    const credentials = await auth0.credentialsManager.getCredentials();
    return credentials?.accessToken ?? null;
  } catch {
    return null;
  }
}

export async function hasValidSession(): Promise<boolean> {
  try {
    return await auth0.credentialsManager.hasValidCredentials();
  } catch {
    return false;
  }
}

export async function clearLocalCredentials(): Promise<void> {
  try {
    await auth0.credentialsManager.clearCredentials();
  } catch {
    // No credentials to clear.
  }
}
