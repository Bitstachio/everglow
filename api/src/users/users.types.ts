import { Prisma } from "generated/prisma/client";

export const userWithDetailsInclude = { details: true } as const;

export type UserWithDetails = Prisma.UserGetPayload<{
  include: typeof userWithDetailsInclude;
}>;

/** A user who has completed onboarding, so the profile row is known to exist. */
export type OnboardedUser = UserWithDetails & { details: NonNullable<UserWithDetails["details"]> };
