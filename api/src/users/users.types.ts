import { Prisma } from "generated/prisma/client";

export const userWithDetailsInclude = { details: true } as const;

export type UserWithDetails = Prisma.UserGetPayload<{
  include: typeof userWithDetailsInclude;
}>;
