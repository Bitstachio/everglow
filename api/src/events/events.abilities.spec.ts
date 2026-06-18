import { AbilityBuilder, subject } from "@casl/ability";
import { createPrismaAbility } from "@casl/prisma";
import { AbilityUserContext, AppAbility } from "src/casl/ability.types";
import { defineEventAbilities, EVENT_ACTIONS, EVENT_SUBJECT } from "./events.abilities";

describe("defineEventAbilities", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  const eventId = "66666666-6666-6666-6666-666666666666";

  const createAbilityForUser = (user: AbilityUserContext): AppAbility => {
    const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);
    defineEventAbilities(can, user);
    return build();
  };

  it("grants no event permissions when the user has not completed onboarding", () => {
    const ability = createAbilityForUser({ id: userId, isOnboarded: false });

    expect(ability.can(EVENT_ACTIONS.CREATE, EVENT_SUBJECT)).toBe(false);
    expect(ability.can(EVENT_ACTIONS.READ, EVENT_SUBJECT)).toBe(false);
    expect(ability.can(EVENT_ACTIONS.DELETE, EVENT_SUBJECT)).toBe(false);
    expect(ability.can(EVENT_ACTIONS.UPDATE, EVENT_SUBJECT)).toBe(false);
  });

  it("allows onboarded users to create events", () => {
    const ability = createAbilityForUser({ id: userId, isOnboarded: true });

    expect(ability.can(EVENT_ACTIONS.CREATE, EVENT_SUBJECT)).toBe(true);
  });

  it("allows users to read events they created", () => {
    const ability = createAbilityForUser({ id: userId, isOnboarded: true });

    expect(ability.can(EVENT_ACTIONS.READ, subject(EVENT_SUBJECT, { id: eventId, creatorId: userId } as never))).toBe(
      true,
    );
  });

  it("allows users to read events they were invited to", () => {
    const ability = createAbilityForUser({ id: userId, isOnboarded: true });

    expect(
      ability.can(
        EVENT_ACTIONS.READ,
        subject(EVENT_SUBJECT, {
          id: eventId,
          creatorId: "other-user",
          eventAccesses: [{ userId, accessLevel: "VIEWER" }],
        } as never),
      ),
    ).toBe(true);
  });

  it("allows organizers to update events", () => {
    const ability = createAbilityForUser({ id: userId, isOnboarded: true });

    expect(
      ability.can(
        EVENT_ACTIONS.UPDATE,
        subject(EVENT_SUBJECT, {
          id: eventId,
          eventAccesses: [{ userId, accessLevel: "ORGANIZER" }],
        } as never),
      ),
    ).toBe(true);
  });

  it("denies update for participants and viewers", () => {
    const ability = createAbilityForUser({ id: userId, isOnboarded: true });

    expect(
      ability.can(
        EVENT_ACTIONS.UPDATE,
        subject(EVENT_SUBJECT, {
          id: eventId,
          eventAccesses: [{ userId, accessLevel: "PARTICIPANT" }],
        } as never),
      ),
    ).toBe(false);

    expect(
      ability.can(
        EVENT_ACTIONS.UPDATE,
        subject(EVENT_SUBJECT, {
          id: eventId,
          eventAccesses: [{ userId, accessLevel: "VIEWER" }],
        } as never),
      ),
    ).toBe(false);
  });

  it("allows organizers to delete events", () => {
    const ability = createAbilityForUser({ id: userId, isOnboarded: true });

    expect(
      ability.can(
        EVENT_ACTIONS.DELETE,
        subject(EVENT_SUBJECT, {
          id: eventId,
          eventAccesses: [{ userId, accessLevel: "ORGANIZER" }],
        } as never),
      ),
    ).toBe(true);
  });

  it("denies delete for participants and viewers", () => {
    const ability = createAbilityForUser({ id: userId, isOnboarded: true });

    expect(
      ability.can(
        EVENT_ACTIONS.DELETE,
        subject(EVENT_SUBJECT, {
          id: eventId,
          eventAccesses: [{ userId, accessLevel: "PARTICIPANT" }],
        } as never),
      ),
    ).toBe(false);

    expect(
      ability.can(
        EVENT_ACTIONS.DELETE,
        subject(EVENT_SUBJECT, {
          id: eventId,
          eventAccesses: [{ userId, accessLevel: "VIEWER" }],
        } as never),
      ),
    ).toBe(false);
  });
});
