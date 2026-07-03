import { AbilityBuilder, subject } from "@casl/ability";
import { createPrismaAbility } from "@casl/prisma";
import { AbilityUserContext, AppAbility } from "src/casl/ability.types";
import { definePhotoAbilities, PHOTO_ACTIONS, PHOTO_SUBJECT } from "./photos.abilities";

describe("definePhotoAbilities", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  const otherUserId = "22222222-2222-2222-2222-222222222222";
  const eventId = "66666666-6666-6666-6666-666666666666";
  const galleryId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const photoId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  const createAbilityForUser = (user: AbilityUserContext): AppAbility => {
    const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);
    definePhotoAbilities(can, user);
    return build();
  };

  const photoWithAccess = (
    accessLevel: "ORGANIZER" | "PARTICIPANT" | "VIEWER",
    { accessUserId = userId, addedById = userId } = {},
  ) =>
    subject(PHOTO_SUBJECT, {
      id: photoId,
      galleryId,
      addedById,
      gallery: {
        id: galleryId,
        eventId,
        event: {
          id: eventId,
          eventAccesses: [{ userId: accessUserId, accessLevel }],
        },
      },
    } as never);

  it("grants no photo permissions when the user has not completed onboarding", () => {
    const ability = createAbilityForUser({ id: userId, isOnboarded: false });

    expect(ability.can(PHOTO_ACTIONS.READ, PHOTO_SUBJECT)).toBe(false);
    expect(ability.can(PHOTO_ACTIONS.CREATE, PHOTO_SUBJECT)).toBe(false);
    expect(ability.can(PHOTO_ACTIONS.DELETE, PHOTO_SUBJECT)).toBe(false);
  });

  describe("read", () => {
    it("allows any event member to read photos (organizer, participant, viewer)", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      expect(ability.can(PHOTO_ACTIONS.READ, photoWithAccess("ORGANIZER"))).toBe(true);
      expect(ability.can(PHOTO_ACTIONS.READ, photoWithAccess("PARTICIPANT"))).toBe(true);
      expect(ability.can(PHOTO_ACTIONS.READ, photoWithAccess("VIEWER"))).toBe(true);
    });

    it("denies read when the user has no access to the parent event", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      expect(ability.can(PHOTO_ACTIONS.READ, photoWithAccess("ORGANIZER", { accessUserId: otherUserId }))).toBe(false);
    });
  });

  describe("create", () => {
    it("allows organizers and participants to upload photos", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      expect(ability.can(PHOTO_ACTIONS.CREATE, photoWithAccess("ORGANIZER"))).toBe(true);
      expect(ability.can(PHOTO_ACTIONS.CREATE, photoWithAccess("PARTICIPANT"))).toBe(true);
    });

    it("denies upload for viewers", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      expect(ability.can(PHOTO_ACTIONS.CREATE, photoWithAccess("VIEWER"))).toBe(false);
    });

    it("denies upload when the user has no access to the parent event", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      expect(ability.can(PHOTO_ACTIONS.CREATE, photoWithAccess("ORGANIZER", { accessUserId: otherUserId }))).toBe(
        false,
      );
    });
  });

  describe("delete", () => {
    it("allows organizers to delete any photo in the gallery", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      expect(ability.can(PHOTO_ACTIONS.DELETE, photoWithAccess("ORGANIZER", { addedById: otherUserId }))).toBe(true);
    });

    it("allows uploaders to delete their own photos", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      expect(ability.can(PHOTO_ACTIONS.DELETE, photoWithAccess("PARTICIPANT", { addedById: userId }))).toBe(true);
      expect(ability.can(PHOTO_ACTIONS.DELETE, photoWithAccess("VIEWER", { addedById: userId }))).toBe(true);
    });

    it("denies participants and viewers deleting photos uploaded by others", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      expect(ability.can(PHOTO_ACTIONS.DELETE, photoWithAccess("PARTICIPANT", { addedById: otherUserId }))).toBe(false);
      expect(ability.can(PHOTO_ACTIONS.DELETE, photoWithAccess("VIEWER", { addedById: otherUserId }))).toBe(false);
    });

    it("denies uploaders deleting their own photos after losing event access", () => {
      const ability = createAbilityForUser({ id: userId, isOnboarded: true });

      expect(
        ability.can(
          PHOTO_ACTIONS.DELETE,
          photoWithAccess("ORGANIZER", { accessUserId: otherUserId, addedById: userId }),
        ),
      ).toBe(false);
    });
  });
});
