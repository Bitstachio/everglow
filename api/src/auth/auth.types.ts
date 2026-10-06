export type AuthenticatedUser = {
  id: string;
  sub: string;
  /** Suspended by the platform: only routes marked @AllowSuspended() let them through. */
  suspended?: boolean;
};
