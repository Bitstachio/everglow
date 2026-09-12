import { AuthenticatedUser } from "src/auth/auth.types";
import { TEST_ACCESS_TOKEN, TEST_PROVIDER_SUB, TEST_USER_ID } from "./users.fixtures";

export const TEST_OTHER_USER_ID = "55555555-5555-5555-5555-555555555555";
export const TEST_OTHER_PROVIDER_SUB = "auth0|e2e-other-user";
export const TEST_OTHER_ACCESS_TOKEN = "e2e-other-user-token";

export const TEST_TARGET_USER_ID = "44444444-4444-4444-4444-444444444444";
export const TEST_TARGET_PROVIDER_SUB = "auth0|e2e-target-user";
export const TEST_TARGET_ACCESS_TOKEN = "e2e-target-user-token";

const AUTH_USERS_BY_TOKEN: Record<string, AuthenticatedUser> = {
  [TEST_ACCESS_TOKEN]: { id: TEST_USER_ID, sub: TEST_PROVIDER_SUB },
  [TEST_OTHER_ACCESS_TOKEN]: { id: TEST_OTHER_USER_ID, sub: TEST_OTHER_PROVIDER_SUB },
  [TEST_TARGET_ACCESS_TOKEN]: { id: TEST_TARGET_USER_ID, sub: TEST_TARGET_PROVIDER_SUB },
};

export const resolveAuthenticatedUser = (token: string): AuthenticatedUser =>
  AUTH_USERS_BY_TOKEN[token] ?? AUTH_USERS_BY_TOKEN[TEST_ACCESS_TOKEN];

export const authHeader = (token = TEST_ACCESS_TOKEN) => ({
  Authorization: `Bearer ${token}`,
});
