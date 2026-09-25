import { Injectable } from "@nestjs/common";
import { AccessLevel, Prisma } from "generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { EventForPhotoVisibility } from "./moderation.types";

/**
 * The single definition of "which photos of this event may this caller see"
 * on top of membership (CASL) and `READY` status, which the photo read paths
 * already enforce. Every read of a photo goes through `whereVisibleTo`, so the
 * list and the single read cannot drift apart. See docs/moderation.md.
 */
@Injectable()
export class PhotoVisibilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A `Photo` filter to AND into a query scoped to `event`. Organizers get an
   * empty filter: they moderate, so they see everything. Everyone else loses
   * photos of anyone they blocked or who blocked them.
   *
   * No extra query: the rule is a subquery inside the photo query itself.
   */
  whereVisibleTo(callerId: string, event: EventForPhotoVisibility): Prisma.PhotoWhereInput {
    if (event.eventAccesses.some((access) => access.accessLevel === AccessLevel.ORGANIZER)) return {};

    return {
      AND: [
        {
          // A photo whose uploader is gone (addedById null) matches no block.
          NOT: {
            addedBy: {
              is: {
                OR: [
                  { blocksReceived: { some: { blockerId: callerId } } },
                  { blocksInitiated: { some: { blockedId: callerId } } },
                ],
              },
            },
          },
        },
      ],
    };
  }

  /** Whether one photo of `event` passes `whereVisibleTo` for the caller. */
  async isVisibleTo(photoId: string, callerId: string, event: EventForPhotoVisibility): Promise<boolean> {
    const visible = await this.prisma.photo.count({
      where: { AND: [{ id: photoId }, this.whereVisibleTo(callerId, event)] },
    });

    return visible > 0;
  }
}
