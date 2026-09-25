import { BlockWithBlockedUser } from "src/moderation/moderation.types";
import { TEST_TARGET_USER_ID } from "./auth.fixtures";
import { buildTargetUserWithDetails } from "./events.fixtures";
import { TEST_NOW, TEST_USER_ID } from "./users.fixtures";

export const TEST_BLOCK_ID = "b10cb10c-b10c-4b10-8b10-b10cb10cb10c";

/** The primary test user's block on the target user. */
export const buildBlock = (overrides: Partial<BlockWithBlockedUser> = {}): BlockWithBlockedUser => ({
  id: TEST_BLOCK_ID,
  blockerId: TEST_USER_ID,
  blockedId: TEST_TARGET_USER_ID,
  createdAt: TEST_NOW,
  blocked: buildTargetUserWithDetails(),
  ...overrides,
});
