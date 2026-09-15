export const AUTH0_MANAGEMENT_ERRORS = {
  CREDENTIALS_NOT_CONFIGURED: () => "Auth0 Management API credentials are not configured",
  DELETE_USER_FAILED: (providerSub: string) => `Failed to delete Auth0 user "${providerSub}"`,
};
