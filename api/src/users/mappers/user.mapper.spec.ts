import { S3Service } from "src/sdk/aws/s3/s3.service";
import { UserMapper } from "./user.mapper";
import { UserWithDetails } from "../users.types";

describe("UserMapper", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  const providerSub = "auth0|abc123";
  const now = new Date("2026-06-10T12:00:00.000Z");

  const s3 = {
    getPresignedDownloadUrl: jest.fn().mockResolvedValue("https://example.com/avatar"),
  } as unknown as S3Service;

  const userWithoutDetails: UserWithDetails = {
    id: userId,
    providerSub,
    createdAt: now,
    updatedAt: now,
    details: null,
  };

  const userWithDetails: UserWithDetails = {
    id: userId,
    providerSub,
    createdAt: now,
    updatedAt: now,
    details: {
      id: "22222222-2222-2222-2222-222222222222",
      userId,
      email: "jane@example.com",
      name: "Jane Doe",
      avatarKey: null,
      createdAt: now,
      updatedAt: now,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("toResponseDto", () => {
    it("maps a user with details and sets isOnboarded to true", async () => {
      const result = await UserMapper.toResponseDto(userWithDetails, s3);

      expect(result).toEqual({
        id: userId,
        isOnboarded: true,
        details: {
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

    it("resolves avatarUrl when avatarKey is set", async () => {
      const userWithAvatar: UserWithDetails = {
        ...userWithDetails,
        details: {
          ...userWithDetails.details!,
          avatarKey: "avatars/user-id",
        },
      };

      const result = await UserMapper.toResponseDto(userWithAvatar, s3);

      expect(s3.getPresignedDownloadUrl).toHaveBeenCalledWith({ key: "avatars/user-id" });
      expect(result.details?.avatarUrl).toBe("https://example.com/avatar");
    });

    it("maps a user without details and sets isOnboarded to false", async () => {
      const result = await UserMapper.toResponseDto(userWithoutDetails, s3);

      expect(result).toEqual({
        id: userId,
        isOnboarded: false,
        details: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    it("omits internal fields from nested details", async () => {
      const result = await UserMapper.toResponseDto(userWithDetails, s3);

      expect(result.details).not.toHaveProperty("id");
      expect(result.details).not.toHaveProperty("userId");
      expect(result.details).not.toHaveProperty("avatarKey");
    });
  });
});
