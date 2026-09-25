import { FREE_TIER_STORAGE_LIMIT_BYTES } from "src/photos/photos.constants";
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
  username: "jane.doe",
  ...overrides,
});

export const updateUserPayload = (overrides: Partial<UpdateUserDto> = {}): UpdateUserDto => ({
  name: "Jane Updated",
  ...overrides,
});

export const buildUserWithoutDetails = (overrides: Partial<UserWithDetails> = {}): UserWithDetails => ({
  id: TEST_USER_ID,
  providerSub: TEST_PROVIDER_SUB,
  storageLimitBytes: FREE_TIER_STORAGE_LIMIT_BYTES,
  deletionStartedAt: null,
  auth0DeletedAt: null,
  deletionPhotoPolicy: null,
  deletionAttempts: 0,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
  details: null,
  ...overrides,
});

export const buildUserWithDetails = (overrides: Partial<UserWithDetails> = {}): UserWithDetails => ({
  id: TEST_USER_ID,
  providerSub: TEST_PROVIDER_SUB,
  storageLimitBytes: FREE_TIER_STORAGE_LIMIT_BYTES,
  deletionStartedAt: null,
  auth0DeletedAt: null,
  deletionPhotoPolicy: null,
  deletionAttempts: 0,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
  details: {
    id: TEST_DETAILS_ID,
    userId: TEST_USER_ID,
    username: "jane.doe",
    email: "jane@example.com",
    name: "Jane Doe",
    avatarS3Key: null,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  },
  ...overrides,
});
