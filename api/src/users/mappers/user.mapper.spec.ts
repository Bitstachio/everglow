import { UserMapper } from "./user.mapper";
import { UserWithDetails } from "../users.types";

describe("UserMapper", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  const providerSub = "auth0|abc123";
  const now = new Date("2026-06-10T12:00:00.000Z");

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
      createdAt: now,
      updatedAt: now,
    },
  };

  describe("toResponseDto", () => {
    it("maps a user with details and sets isOnboarded to true", () => {
      const result = UserMapper.toResponseDto(userWithDetails);

      expect(result).toEqual({
        id: userId,
        isOnboarded: true,
        details: {
          email: "jane@example.com",
          name: "Jane Doe",
          createdAt: now,
          updatedAt: now,
        },
        createdAt: now,
        updatedAt: now,
      });
    });

    it("maps a user without details and sets isOnboarded to false", () => {
      const result = UserMapper.toResponseDto(userWithoutDetails);

      expect(result).toEqual({
        id: userId,
        isOnboarded: false,
        details: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    it("omits internal fields from nested details", () => {
      const result = UserMapper.toResponseDto(userWithDetails);

      expect(result.details).not.toHaveProperty("id");
      expect(result.details).not.toHaveProperty("userId");
    });
  });
});
