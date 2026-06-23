import { AbilityBuilder, subject } from "@casl/ability";
import { createPrismaAbility } from "@casl/prisma";
import { AbilityUserContext, AppAbility } from "src/casl/ability.types";
import { defineGalleryAbilities, GALLERY_ACTIONS, GALLERY_SUBJECT } from "./galleries.abilities";

describe("defineGalleryAbilities", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  const otherUserId = "22222222-2222-2222-2222-222222222222";
  const eventId = "66666666-6666-6666-6666-666666666666";
  const galleryId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  const createAbilityForUser = (user: AbilityUserContext): AppAbility => {
    const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);
    defineGalleryAbilities(can, user);
    return build();
  };

  const galleryWithAccess = (accessLevel: "ORGANIZER" | "PARTICIPANT" | "VIEWER", accessUserId = userId) =>
    subject(GALLERY_SUBJECT, {
      id: galleryId,
      eventId,
      event: {
        id: eventId,
        eventAccesses: [{ userId: accessUserId, accessLevel }],
      },
    } as never);

  it("grants no gallery permissions when the user has not completed onboarding", () => {
    const ability = createAbilityForUser({ id: userId, isOnboarded: false });

    expect(ability.can(GALLERY_ACTIONS.READ, GALLERY_SUBJECT)).toBe(false);
    expect(ability.can(GALLERY_ACTIONS.CREATE, GALLERY_SUBJECT)).toBe(false);
    expect(ability.can(GALLERY_ACTIONS.UPDATE, GALLERY_SUBJECT)).toBe(false);
    expect(ability.can(GALLERY_ACTIONS.DELETE, GALLERY_SUBJECT)).toBe(false);
  });

  describe("read", () => {
    it("allows any event member to read galleries (organizer, participant, viewer)", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      expect(ability.can(GALLERY_ACTIONS.READ, galleryWithAccess("ORGANIZER"))).toBe(true);
      expect(ability.can(GALLERY_ACTIONS.READ, galleryWithAccess("PARTICIPANT"))).toBe(true);
      expect(ability.can(GALLERY_ACTIONS.READ, galleryWithAccess("VIEWER"))).toBe(true);
    });

    it("denies read when the user has no access to the parent event", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      expect(ability.can(GALLERY_ACTIONS.READ, galleryWithAccess("ORGANIZER", otherUserId))).toBe(false);
    });
  });

  describe("create / update / delete", () => {
    it("allows organizers to create, update, and delete galleries", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });
      const gallery = galleryWithAccess("ORGANIZER");

      expect(ability.can(GALLERY_ACTIONS.CREATE, gallery)).toBe(true);
      expect(ability.can(GALLERY_ACTIONS.UPDATE, gallery)).toBe(true);
      expect(ability.can(GALLERY_ACTIONS.DELETE, gallery)).toBe(true);
    });

    it("denies create/update/delete for participants and viewers", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      for (const level of ["PARTICIPANT", "VIEWER"] as const) {
        const gallery = galleryWithAccess(level);
        expect(ability.can(GALLERY_ACTIONS.CREATE, gallery)).toBe(false);
        expect(ability.can(GALLERY_ACTIONS.UPDATE, gallery)).toBe(false);
        expect(ability.can(GALLERY_ACTIONS.DELETE, gallery)).toBe(false);
      }
    });

    it("denies create/update/delete when the user has no access to the parent event", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });
      const gallery = galleryWithAccess("ORGANIZER", otherUserId);

      expect(ability.can(GALLERY_ACTIONS.CREATE, gallery)).toBe(false);
      expect(ability.can(GALLERY_ACTIONS.UPDATE, gallery)).toBe(false);
      expect(ability.can(GALLERY_ACTIONS.DELETE, gallery)).toBe(false);
    });
  });
});
