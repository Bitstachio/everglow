import { AbilityBuilder } from "@casl/ability";
import { AccessLevel } from "generated/prisma/client";
import { AbilityUserContext, AppAbility } from "src/casl/ability.types";

export const PHOTO_ACTIONS = {
  READ: "read",
  CREATE: "create",
  DELETE: "delete",
} as const;

export const PHOTO_SUBJECT = "Photo" as const;

export type PhotoAction = (typeof PHOTO_ACTIONS)[keyof typeof PHOTO_ACTIONS];

export const definePhotoAbilities = (can: AbilityBuilder<AppAbility>["can"], user: AbilityUserContext): void => {
  if (!user.isOnboarded) return;

  // Viewers can read photos.
  can(PHOTO_ACTIONS.READ, PHOTO_SUBJECT, {
    event: { is: { eventAccesses: { some: { userId: user.id } } } },
  });

  // Organizers and participants can upload photos.
  can(PHOTO_ACTIONS.CREATE, PHOTO_SUBJECT, {
    event: {
      is: {
        eventAccesses: {
          some: { userId: user.id, accessLevel: { in: [AccessLevel.ORGANIZER, AccessLevel.PARTICIPANT] } },
        },
      },
    },
  });

  // Organizers can delete photos.
  can(PHOTO_ACTIONS.DELETE, PHOTO_SUBJECT, {
    event: { is: { eventAccesses: { some: { userId: user.id, accessLevel: AccessLevel.ORGANIZER } } } },
  });

  // Uploaders can always delete their own photos, membership or not. Photos
  // kept in an event they left or were removed from still count toward their
  // storage, so they must be able to take them back (docs/photos-architecture.md
  // §9). This also covers releasing their own unconfirmed PENDING slots.
  can(PHOTO_ACTIONS.DELETE, PHOTO_SUBJECT, { addedById: user.id });
};
