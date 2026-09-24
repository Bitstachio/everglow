import { registerAs } from "@nestjs/config";

export default registerAs("auth0", () => {
  const domain = process.env.AUTH0_DOMAIN;

  return {
    domain,
    audience: process.env.AUTH0_AUDIENCE,
    issuer: domain ? `https://${domain}/` : undefined,
    jwksUri: domain ? `https://${domain}/.well-known/jwks.json` : undefined,
    // Machine-to-Machine app credentials for Auth0 Management API (delete user,
    // password-change tickets, etc.). Needs create:user_tickets in addition to
    // the deletion scopes documented in .env.example.
    managementClientId: process.env.AUTH0_MANAGEMENT_CLIENT_ID,
    managementClientSecret: process.env.AUTH0_MANAGEMENT_CLIENT_SECRET,
    // Native app client id (same value as EXPO_PUBLIC_AUTH0_CLIENT_ID). Passed on
    // password-change tickets so New Universal Login brands the page and can
    // offer "Back to app" via the application's Application Login URI.
    nativeClientId: process.env.AUTH0_NATIVE_CLIENT_ID,
  };
});
