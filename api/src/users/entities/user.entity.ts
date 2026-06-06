import { BaseEntity } from "../../common/entities/base.entity";
import { EventAccess } from "../../events/entities/event-access.entity";
import { Event } from "../../events/entities/event.entity";
import { Photo } from "../../photos/entities/photo.entity";
import { UserAuth } from "./user-auth.entity";

// TypeORM decorators removed — plain model until Prisma migration.
export class User extends BaseEntity {
  email: string;
  name: string;
  auth?: UserAuth;
  createdEvents?: Event[];
  eventAccesses?: EventAccess[];
  photos?: Photo[];
}
