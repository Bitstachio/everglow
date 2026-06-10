import { CreateUserDetailsDto } from "src/users/dto/create-user-details.dto";
import { UpdateUserDto } from "src/users/dto/update-user.dto";
import { UserWithDetails } from "src/users/users.types";

export const TEST_USER_ID = "11111111-1111-1111-1111-111111111111";
export const TEST_PROVIDER_SUB = "auth0|e2e-test-user";
export const TEST_DETAILS_ID = "22222222-2222-2222-2222-222222222222";
export const TEST_ACCESS_TOKEN = "e2e-valid-token";
export const TEST_NOW = new Date("2026-06-10T12:00:00.000Z");

export const createUserDetailsPayload = (overrides: Partial<CreateUserDetailsDto> = {}): CreateUserDetailsDto => ({
  name: "Jane Doe",
  email: "jane@example.com",
  ...overrides,
});

export const updateUserPayload = (overrides: Partial<UpdateUserDto> = {}): UpdateUserDto => ({
  name: "Jane Updated",
  ...overrides,
});

export const buildUserWithoutDetails = (overrides: Partial<UserWithDetails> = {}): UserWithDetails => ({
  id: TEST_USER_ID,
  providerSub: TEST_PROVIDER_SUB,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
  details: null,
  ...overrides,
});

export const buildUserWithDetails = (overrides: Partial<UserWithDetails> = {}): UserWithDetails => ({
  id: TEST_USER_ID,
  providerSub: TEST_PROVIDER_SUB,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
  details: {
    id: TEST_DETAILS_ID,
    userId: TEST_USER_ID,
    email: "jane@example.com",
    name: "Jane Doe",
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  },
  ...overrides,
});
