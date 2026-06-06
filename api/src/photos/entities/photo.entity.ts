import { BaseEntity } from "../../common/entities/base.entity";
import { User } from "../../users/entities/user.entity";
import { Event } from "../../events/entities/event.entity";

// TypeORM decorators removed — plain model until Prisma migration.
export class Photo extends BaseEntity {
  imageUrl: string;
  addedById: string;
  eventId: string;
  addedBy?: User;
  event?: Event;
}
