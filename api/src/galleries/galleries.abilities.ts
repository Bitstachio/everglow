import { AbilityBuilder } from "@casl/ability";
import { AccessLevel } from "generated/prisma/client";
import { AbilityUserContext, AppAbility } from "src/casl/ability.types";

export const GALLERY_ACTIONS = {
  READ: "read",
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
} as const;

export const GALLERY_SUBJECT = "Gallery" as const;

export type GalleryAction = (typeof GALLERY_ACTIONS)[keyof typeof GALLERY_ACTIONS];

export const defineGalleryAbilities = (can: AbilityBuilder<AppAbility>["can"], user: AbilityUserContext): void => {
  if (!user.isOnboarded) return;

  can(GALLERY_ACTIONS.READ, GALLERY_SUBJECT, {
    event: { is: { eventAccesses: { some: { userId: user.id } } } },
  });

  // CREATE/UPDATE/DELETE rules are defined for future flexibility — Gallery
  // is modeled as its own entity to support multi-gallery events later.
  // For the current iteration, each event auto-creates a single default
  // gallery and no mutation endpoints are exposed.
  can(GALLERY_ACTIONS.CREATE, GALLERY_SUBJECT, {
    event: { is: { eventAccesses: { some: { userId: user.id, accessLevel: AccessLevel.ORGANIZER } } } },
  });

  can(GALLERY_ACTIONS.UPDATE, GALLERY_SUBJECT, {
    event: { is: { eventAccesses: { some: { userId: user.id, accessLevel: AccessLevel.ORGANIZER } } } },
  });

  can(GALLERY_ACTIONS.DELETE, GALLERY_SUBJECT, {
    event: { is: { eventAccesses: { some: { userId: user.id, accessLevel: AccessLevel.ORGANIZER } } } },
  });
};
