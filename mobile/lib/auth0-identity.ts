/**
 * Auth0 identity helpers with no native SDK dependency so unit tests can import
 * them without TurboModuleRegistry.
 */

/** Database (email/password) identities use the `auth0|…` subject prefix. */
export const isDatabaseIdentity = (sub: string | null | undefined): boolean =>
  typeof sub === "string" && sub.startsWith("auth0|");

export type SocialProvider = "apple" | "google";

/** The social provider an Auth0 subject signs in with, or null for email and password or anything else. */
export const socialProvider = (sub: string | null | undefined): SocialProvider | null => {
  if (typeof sub !== "string") return null;
  if (sub.startsWith("apple|")) return "apple";
  if (sub.startsWith("google-oauth2|")) return "google";
  return null;
};
