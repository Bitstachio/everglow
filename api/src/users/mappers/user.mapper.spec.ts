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
    termsAcceptedAt: null,
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
    termsAcceptedAt: null,
    createdAt: now,
    updatedAt: now,
    details: {
      id: "22222222-2222-2222-2222-222222222222",
      userId,
      username: "jane",
      name: "Jane Doe",
      avatarS3Key: null,
      createdAt: now,
      updatedAt: now,
    },
  };

  describe("toResponseDto", () => {
    it("maps a user with details and sets isOnboarded to true", () => {
      const result = UserMapper.toResponseDto(userWithDetails, null, null);

      expect(result).toEqual({
        id: userId,
        isOnboarded: true,
        details: {
          username: "jane",
          name: "Jane Doe",
          avatarUrl: null,
          usernameChangeAvailableAt: null,
          createdAt: now,
          updatedAt: now,
        },
        termsAcceptedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    it("exposes when the terms were accepted", () => {
      const result = UserMapper.toResponseDto({ ...userWithDetails, termsAcceptedAt: now }, null, null);

      expect(result.termsAcceptedAt).toEqual(now);
    });

    it("maps a user without details and sets isOnboarded to false", () => {
      const result = UserMapper.toResponseDto(userWithoutDetails, null, null);

      expect(result).toEqual({
        id: userId,
        isOnboarded: false,
        details: null,
        termsAcceptedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    it("exposes the presigned avatar URL on the details", () => {
      const result = UserMapper.toResponseDto(userWithDetails, "https://s3.example/avatar?sig=1", null);

      expect(result.details?.avatarUrl).toBe("https://s3.example/avatar?sig=1");
    });

    it("exposes when the username can be changed again", () => {
      const availableAt = new Date("2026-06-24T12:00:00.000Z");

      const result = UserMapper.toResponseDto(userWithDetails, null, availableAt);

      expect(result.details?.usernameChangeAvailableAt).toEqual(availableAt);
    });

    it("omits internal fields from nested details", () => {
      const result = UserMapper.toResponseDto(userWithDetails, null, null);

      expect(result.details).not.toHaveProperty("id");
      expect(result.details).not.toHaveProperty("userId");
      expect(result.details).not.toHaveProperty("avatarS3Key");
    });
  });

  describe("toLimitsResponseDto", () => {
    const limits = { plan: "FREE" as const, maxActiveEvents: 2 };

    it("pairs the account's limits with its usage and the event that closes first", () => {
      const galleryClosesAt = new Date("2026-10-20T18:00:00.000Z");
      const nextClosingEvent = { id: "33333333-3333-3333-3333-333333333333", title: "Book Club", galleryClosesAt };

      expect(UserMapper.toLimitsResponseDto(limits, { activeEvents: 1, nextClosingEvent })).toEqual({
        plan: "FREE",
        limits: { activeEvents: 2 },
        usage: { activeEvents: 1 },
        nextClosingEvent: { id: nextClosingEvent.id, title: "Book Club", galleryClosesAt },
      });
    });

    it("keeps no limit and no closing event as null", () => {
      const result = UserMapper.toLimitsResponseDto(
        { plan: "FREE", maxActiveEvents: null },
        { activeEvents: 0, nextClosingEvent: null },
      );

      expect(result.limits.activeEvents).toBeNull();
      expect(result.nextClosingEvent).toBeNull();
    });
  });
});
