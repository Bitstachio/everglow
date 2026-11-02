import { SetMetadata } from "@nestjs/common";

export const ALLOW_SUSPENDED_KEY = "allowSuspended";

/**
 * Lets a suspended account through JwtAuthGuard on this route. Only reading
 * and deleting the account itself: a suspended person can still see why, and
 * still leave (docs/moderation.md §8).
 */
export const AllowSuspended = () => SetMetadata(ALLOW_SUSPENDED_KEY, true);

export const ALLOW_DELETION_IN_PROGRESS_KEY = "allowDeletionInProgress";

/**
 * Lets an account whose deletion has started through JwtAuthGuard on this
 * route. Only `DELETE /users/me`, so the person can finish what they asked
 * for; every other route answers 401 ACCOUNT_DELETION_IN_PROGRESS
 * (docs/account-deletion.md §4).
 */
export const AllowDeletionInProgress = () => SetMetadata(ALLOW_DELETION_IN_PROGRESS_KEY, true);
