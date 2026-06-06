import * as crypto from "crypto";
import { BaseEntity } from "../../common/entities/base.entity";
import { User } from "../../users/entities/user.entity";
import { Photo } from "../../photos/entities/photo.entity";
import { EventAccess } from "./event-access.entity";

// TypeORM decorators removed — plain model until Prisma migration.
export class Event extends BaseEntity {
  title: string;
  description: string | null;
  date: Date;
  creatorId: string;
  invitationUrl: string;
  creator?: User;
  photos?: Photo[];
  eventAccesses?: EventAccess[];

  // Previously @BeforeInsert — move to service layer when using Prisma.
  generateInvitationUrl() {
    if (!this.invitationUrl) {
      this.invitationUrl = crypto.randomBytes(16).toString("hex");
    }
  }
}
