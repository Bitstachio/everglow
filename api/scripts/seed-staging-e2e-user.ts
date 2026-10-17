/**
 * Idempotent seed for staging Maestro E2E users: User + UserDetails so Auth0
 * login skips onboarding (isOnboarded === !!details).
 *
 * Usage (from api/, with DATABASE_URL pointing at staging Neon):
 *   pnpm run seed:staging-e2e
 *
 * Set E2E_PROVIDER_SUB_1..3 in api/.env to each Auth0 user_id (sub).
 * Usernames/names below are public fixtures. Auth0 emails/passwords stay in Auth0.
 *
 * Does not create Auth0 users and does not store passwords.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

type StagingE2eUser = {
  /** Auth0 user_id / JWT `sub` (from env). */
  providerSub: string;
  /** Everglow public handle (not the Auth0 email). */
  username: string;
  name: string;
};

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

/** Public Everglow profile fixtures; providerSub comes from env. */
const STAGING_E2E_USERS: Omit<StagingE2eUser, "providerSub">[] = [
  { username: "test.user_1", name: "Test User 1" },
  { username: "test.user_2", name: "Test User 2" },
  { username: "test.user_3", name: "Test User 3" },
];

const PROVIDER_SUB_ENV_KEYS = ["E2E_PROVIDER_SUB_1", "E2E_PROVIDER_SUB_2", "E2E_PROVIDER_SUB_3"] as const;

const seedUser = async (prisma: PrismaClient, fixture: StagingE2eUser, now: Date): Promise<void> => {
  const username = fixture.username.trim().toLowerCase();
  const name = fixture.name.trim();

  const user = await prisma.user.upsert({
    where: { providerSub: fixture.providerSub },
    create: {
      providerSub: fixture.providerSub,
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
};

const main = async (): Promise<void> => {
  const connectionString = requireEnv("DATABASE_URL");
  const fixtures: StagingE2eUser[] = STAGING_E2E_USERS.map((profile, index) => ({
    ...profile,
    providerSub: requireEnv(PROVIDER_SUB_ENV_KEYS[index]),
  }));

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const now = new Date();
    for (const fixture of fixtures) {
      await seedUser(prisma, fixture, now);
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
