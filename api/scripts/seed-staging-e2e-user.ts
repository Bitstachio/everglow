/**
 * Idempotent seed for the staging Maestro E2E user: User + UserDetails so
 * Auth0 login skips onboarding (isOnboarded === !!details).
 *
 * Usage (from api/, with DATABASE_URL pointing at staging Neon):
 *   pnpm run seed:staging-e2e
 *
 * 1. Create the Auth0 test user in the tenant staging uses.
 * 2. Copy user_id (the `sub`, e.g. auth0|…) into E2E_PROVIDER_SUB below
 *    (or set the env var of the same name).
 * 3. Adjust username / name if you want, then run the script.
 *
 * Does not create Auth0 users and does not store passwords.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

/** Auth0 user_id / JWT `sub`. Replace before running against staging. */
const E2E_PROVIDER_SUB = process.env.E2E_PROVIDER_SUB ?? "auth0|REPLACE_ME";

/** Public handle (lowercase letters, numbers, periods, underscores; 3–30). */
const E2E_USERNAME = process.env.E2E_USERNAME ?? "maestro.staging";

const E2E_NAME = process.env.E2E_NAME ?? "Maestro Staging";

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

async function main(): Promise<void> {
  if (E2E_PROVIDER_SUB.includes("REPLACE_ME")) {
    throw new Error(
      "Set E2E_PROVIDER_SUB to the Auth0 user_id (sub) before seeding. " +
        "Edit the constant in scripts/seed-staging-e2e-user.ts or export the env var.",
    );
  }

  const connectionString = requireEnv("DATABASE_URL");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const username = E2E_USERNAME.trim().toLowerCase();
    const name = E2E_NAME.trim();
    const now = new Date();

    const user = await prisma.user.upsert({
      where: { providerSub: E2E_PROVIDER_SUB },
      create: {
        providerSub: E2E_PROVIDER_SUB,
        termsAcceptedAt: now,
        details: {
          create: { username, name },
        },
      },
      update: {
        termsAcceptedAt: now,
        details: {
          upsert: {
            create: { username, name },
            update: { username, name },
          },
        },
      },
      include: { details: true },
    });

    console.log(
      `Seeded staging E2E user ${user.id} (providerSub=${user.providerSub}, ` +
        `username=${user.details?.username ?? "none"})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
