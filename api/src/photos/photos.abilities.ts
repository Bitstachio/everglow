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
    gallery: { is: { event: { is: { eventAccesses: { some: { userId: user.id } } } } } },
  });

  // Organizers and participants can upload photos.
  can(PHOTO_ACTIONS.CREATE, PHOTO_SUBJECT, {
    gallery: {
      is: {
        event: {
          is: {
            eventAccesses: {
              some: { userId: user.id, accessLevel: { in: [AccessLevel.ORGANIZER, AccessLevel.PARTICIPANT] } },
            },
          },
        },
      },
    },
  });

  // Organizers can delete photos.
  can(PHOTO_ACTIONS.DELETE, PHOTO_SUBJECT, {
    gallery: {
      is: { event: { is: { eventAccesses: { some: { userId: user.id, accessLevel: AccessLevel.ORGANIZER } } } } },
    },
  });

  // Participants can delete their own photos, as long as they are still event members.
  can(PHOTO_ACTIONS.DELETE, PHOTO_SUBJECT, {
    addedById: user.id,
    gallery: { is: { event: { is: { eventAccesses: { some: { userId: user.id } } } } } },
  });
};
