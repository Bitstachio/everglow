import { Test, TestingModule } from "@nestjs/testing";
import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { EVENT_ACTIONS, EVENT_SUBJECT } from "src/events/events.abilities";
import { PrismaService } from "src/prisma/prisma.service";
import { UserWithDetails } from "src/users/users.types";
import { AbilityFactory } from "./ability.factory";

describe("AbilityFactory", () => {
  let factory: AbilityFactory;
  let prisma: DeepMockProxy<PrismaClient>;

  const callerId = "11111111-1111-1111-1111-111111111111";
  const now = new Date("2026-06-10T12:00:00.000Z");

  const callerWithoutDetails: UserWithDetails = {
    id: callerId,
    providerSub: "auth0|caller",
    createdAt: now,
    updatedAt: now,
    details: null,
  };

  const callerWithDetails: UserWithDetails = {
    ...callerWithoutDetails,
    details: {
      id: "33333333-3333-3333-3333-333333333333",
      userId: callerId,
      email: "caller@example.com",
      name: "Caller",
      createdAt: now,
      updatedAt: now,
    },
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AbilityFactory, { provide: PrismaService, useValue: prisma }],
    }).compile();

    factory = module.get(AbilityFactory);
  });

  describe("createForCaller", () => {
    it("grants abilities when the caller has completed onboarding", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);

      const ability = await factory.createForCaller(callerId);

      expect(ability.can(EVENT_ACTIONS.CREATE, EVENT_SUBJECT)).toBe(true);
    });

    it("grants no abilities when the caller has not completed onboarding", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithoutDetails);

      const ability = await factory.createForCaller(callerId);

      expect(ability.can(EVENT_ACTIONS.CREATE, EVENT_SUBJECT)).toBe(false);
    });

    it("grants no abilities when the caller does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const ability = await factory.createForCaller(callerId);

      expect(ability.can(EVENT_ACTIONS.CREATE, EVENT_SUBJECT)).toBe(false);
    });
  });
});
