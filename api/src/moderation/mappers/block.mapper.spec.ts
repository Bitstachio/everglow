import { FREE_TIER_STORAGE_LIMIT_BYTES } from "src/photos/photos.constants";
import { BlockWithBlockedUser } from "../moderation.types";
import { BlockMapper } from "./block.mapper";

describe("BlockMapper", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");
  const blockedId = "22222222-2222-2222-2222-222222222222";

  const block: BlockWithBlockedUser = {
    id: "b10cb10c-b10c-4b10-8b10-b10cb10cb10c",
    blockerId: "11111111-1111-1111-1111-111111111111",
    blockedId,
    createdAt: now,
    blocked: {
      id: blockedId,
      providerSub: "auth0|blocked",
      storageLimitBytes: FREE_TIER_STORAGE_LIMIT_BYTES,
      deletionStartedAt: null,
      auth0DeletedAt: null,
      deletionPhotoPolicy: null,
      deletionAttempts: 0,
      termsAcceptedAt: null,
      createdAt: now,
      updatedAt: now,
      details: {
        id: "33333333-3333-3333-3333-333333333333",
        userId: blockedId,
        email: "blocked@example.com",
        name: "Blocked User",
        avatarS3Key: null,
        createdAt: now,
        updatedAt: now,
      },
    },
  };

  it("maps a block to the blocked user's id and name, and nothing else about them", () => {
    expect(BlockMapper.toResponseDto(block)).toEqual({ userId: blockedId, name: "Blocked User", blockedAt: now });
  });

  it("maps a blocked account without a profile to a null name", () => {
    expect(BlockMapper.toResponseDto({ ...block, blocked: { ...block.blocked, details: null } }).name).toBeNull();
  });

  it("wraps the list in items", () => {
    expect(BlockMapper.toListResponseDto([block, block]).items).toHaveLength(2);
  });
});
