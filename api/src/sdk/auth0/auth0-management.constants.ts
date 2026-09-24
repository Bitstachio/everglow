export const AUTH0_MANAGEMENT_ERRORS = {
  CREDENTIALS_NOT_CONFIGURED: () => "Auth0 Management API credentials are not configured",
  PASSWORD_CHANGE_TICKET_NOT_CONFIGURED: () =>
    "Auth0 password-change ticket settings are not configured (native client id)",
  DELETE_USER_FAILED: (providerSub: string) => `Failed to delete Auth0 user "${providerSub}"`,
  GET_USER_FAILED: (providerSub: string) => `Failed to read Auth0 user "${providerSub}"`,
  // Client-facing: do not include providerSub or Auth0 internals.
  PASSWORD_CHANGE_TICKET_FAILED: () => "Could not start a password change. Please try again.",
};
