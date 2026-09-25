import { UserMapper } from "./user.mapper";
import { UserWithDetails } from "../users.types";
import { FREE_TIER_STORAGE_LIMIT_BYTES } from "src/photos/photos.constants";

describe("UserMapper", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  const providerSub = "auth0|abc123";
  const now = new Date("2026-06-10T12:00:00.000Z");

  const userWithoutDetails: UserWithDetails = {
    id: userId,
    providerSub,
    storageLimitBytes: FREE_TIER_STORAGE_LIMIT_BYTES,
    deletionStartedAt: null,
    auth0DeletedAt: null,
    deletionPhotoPolicy: null,
    deletionAttempts: 0,
    createdAt: now,
    updatedAt: now,
    details: null,
  };

  const userWithDetails: UserWithDetails = {
    id: userId,
    providerSub,
    storageLimitBytes: FREE_TIER_STORAGE_LIMIT_BYTES,
    deletionStartedAt: null,
    auth0DeletedAt: null,
    deletionPhotoPolicy: null,
    deletionAttempts: 0,
    createdAt: now,
    updatedAt: now,
    details: {
      id: "22222222-2222-2222-2222-222222222222",
      userId,
      username: "jane",
      email: "jane@example.com",
      name: "Jane Doe",
      avatarS3Key: null,
      createdAt: now,
      updatedAt: now,
    },
  };

  describe("toResponseDto", () => {
    it("maps a user with details and sets isOnboarded to true", () => {
      const result = UserMapper.toResponseDto(userWithDetails, null);

      expect(result).toEqual({
        id: userId,
        isOnboarded: true,
        details: {
          username: "jane",
          email: "jane@example.com",
          name: "Jane Doe",
          avatarUrl: null,
          createdAt: now,
          updatedAt: now,
        },
        createdAt: now,
        updatedAt: now,
      });
    });

    it("maps a user without details and sets isOnboarded to false", () => {
      const result = UserMapper.toResponseDto(userWithoutDetails, null);

      expect(result).toEqual({
        id: userId,
        isOnboarded: false,
        details: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    it("exposes the presigned avatar URL on the details", () => {
      const result = UserMapper.toResponseDto(userWithDetails, "https://s3.example/avatar?sig=1");

      expect(result.details?.avatarUrl).toBe("https://s3.example/avatar?sig=1");
    });

    it("omits internal fields from nested details", () => {
      const result = UserMapper.toResponseDto(userWithDetails, null);

      expect(result.details).not.toHaveProperty("id");
      expect(result.details).not.toHaveProperty("userId");
      expect(result.details).not.toHaveProperty("avatarS3Key");
    });
  });
});
