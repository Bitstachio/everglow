import { SetMetadata } from "@nestjs/common";

export const ALLOW_SUSPENDED_KEY = "allowSuspended";

/**
 * Lets a suspended account through JwtAuthGuard on this route. Only reading
 * and deleting the account itself: a suspended person can still see why, and
 * still leave (docs/moderation.md §8).
 */
export const AllowSuspended = () => SetMetadata(ALLOW_SUSPENDED_KEY, true);
