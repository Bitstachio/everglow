/**
 * Auth0 identity helpers with no native SDK dependency so unit tests can import
 * them without TurboModuleRegistry.
 */

/** Database (email/password) identities use the `auth0|…` subject prefix. */
export const isDatabaseIdentity = (sub: string | null | undefined): boolean =>
  typeof sub === "string" && sub.startsWith("auth0|");
