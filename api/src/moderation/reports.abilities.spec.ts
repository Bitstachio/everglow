import { AbilityBuilder, subject } from "@casl/ability";
import { createPrismaAbility } from "@casl/prisma";
import { AbilityUserContext, AppAbility } from "src/casl/ability.types";
import { defineReportAbilities, REPORT_ACTIONS, REPORT_SUBJECT } from "./reports.abilities";

describe("defineReportAbilities", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  const otherUserId = "22222222-2222-2222-2222-222222222222";
  const eventId = "66666666-6666-6666-6666-666666666666";

  const createAbilityForUser = (user: AbilityUserContext): AppAbility => {
    const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);
    defineReportAbilities(can, user);
    return build();
  };

  const reportWithAccess = (
    accessLevel: "ORGANIZER" | "PARTICIPANT" | "VIEWER",
    { accessUserId = userId, reporterId = userId } = {},
  ) =>
    subject(REPORT_SUBJECT, {
      eventId,
      reporterId,
      event: { id: eventId, eventAccesses: [{ userId: accessUserId, accessLevel }] },
    } as never);

  it("grants no report permissions when the user has not completed onboarding", () => {
    const ability = createAbilityForUser({ id: userId, isOnboarded: false });

    expect(ability.can(REPORT_ACTIONS.CREATE, REPORT_SUBJECT)).toBe(false);
    expect(ability.can(REPORT_ACTIONS.READ, REPORT_SUBJECT)).toBe(false);
    expect(ability.can(REPORT_ACTIONS.UPDATE, REPORT_SUBJECT)).toBe(false);
  });

  describe("create", () => {
    it("allows every member to report, viewers included", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      expect(ability.can(REPORT_ACTIONS.CREATE, reportWithAccess("ORGANIZER"))).toBe(true);
      expect(ability.can(REPORT_ACTIONS.CREATE, reportWithAccess("PARTICIPANT"))).toBe(true);
      expect(ability.can(REPORT_ACTIONS.CREATE, reportWithAccess("VIEWER"))).toBe(true);
    });

    it("denies a user who is not a member of the event", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      expect(ability.can(REPORT_ACTIONS.CREATE, reportWithAccess("PARTICIPANT", { accessUserId: otherUserId }))).toBe(
        false,
      );
    });

    it("denies filing a report in someone else's name", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      expect(ability.can(REPORT_ACTIONS.CREATE, reportWithAccess("PARTICIPANT", { reporterId: otherUserId }))).toBe(
        false,
      );
    });
  });

  describe.each([
    ["read", REPORT_ACTIONS.READ],
    ["update", REPORT_ACTIONS.UPDATE],
  ])("%s", (_name, action) => {
    it("allows organizers of the event", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      expect(ability.can(action, reportWithAccess("ORGANIZER"))).toBe(true);
    });

    it("denies participants and viewers, even for a report they filed", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      expect(ability.can(action, reportWithAccess("PARTICIPANT"))).toBe(false);
      expect(ability.can(action, reportWithAccess("VIEWER"))).toBe(false);
    });

    it("denies an organizer of a different event", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      expect(ability.can(action, reportWithAccess("ORGANIZER", { accessUserId: otherUserId }))).toBe(false);
    });
  });
});
