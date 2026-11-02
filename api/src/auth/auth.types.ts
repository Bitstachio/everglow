export type AuthenticatedUser = {
  id: string;
  sub: string;
  /** Suspended by the platform: only routes marked @AllowSuspended() let them through. */
  suspended?: boolean;
  /** Its deletion has started: only routes marked @AllowDeletionInProgress() let it through. */
  deletionInProgress?: boolean;
};
