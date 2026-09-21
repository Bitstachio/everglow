import { registerAs } from "@nestjs/config";

/**
 * Sign in with Apple credentials the API uses to revoke a user's Apple tokens
 * during account deletion (see docs/authentication.md, "Sign in with Apple").
 *
 * These are the same Team ID, Key ID and .p8 key the Auth0 Apple connection is
 * configured with. `clientId` must be the identifier Auth0 presented to Apple
 * when the user authorised. The mobile app uses Universal Login (a browser
 * flow), so that is the Services ID on the connection, not the iOS bundle
 * identifier; the bundle identifier is only right for Auth0's native flow.
 */
export default registerAs("apple", () => ({
  siwaTeamId: process.env.APPLE_SIWA_TEAM_ID,
  siwaKeyId: process.env.APPLE_SIWA_KEY_ID,
  siwaClientId: process.env.APPLE_SIWA_CLIENT_ID,
  // The .p8 contents. Env files cannot hold newlines, so an escaped "\n" is
  // accepted and unescaped here.
  siwaPrivateKey: process.env.APPLE_SIWA_PRIVATE_KEY?.replace(/\\n/g, "\n"),
}));
