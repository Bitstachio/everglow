import { BaseEntity } from "../../common/entities/base.entity";
import { User } from "../../users/entities/user.entity";
import { Event } from "./event.entity";

export enum AccessLevel {
  ADMIN = 0,
  CONTRIBUTOR = 1,
  VIEWER = 2,
}

// TypeORM decorators removed — plain model until Prisma migration.
export class EventAccess extends BaseEntity {
  userId: string;
  eventId: string;
  accessLevel: AccessLevel;
  user?: User;
  event?: Event;
}
