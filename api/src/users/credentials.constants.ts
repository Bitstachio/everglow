/**
 * Auth0 database (Username-Password) identities use the `auth0|…` subject
 * prefix. Social connections (Apple, Google, …) use their own prefixes and
 * have no password to change through our ticket flow.
 */
export const AUTH0_DATABASE_PROVIDER = "auth0";
export const isAuth0DatabaseProviderSub = (providerSub: string): boolean =>
  providerSub.startsWith(`${AUTH0_DATABASE_PROVIDER}|`);

export const CREDENTIALS_SERVICE_ERRORS = {
  PASSWORD_CHANGE_NOT_AVAILABLE: "Password changes are only available for email and password accounts.",
};
