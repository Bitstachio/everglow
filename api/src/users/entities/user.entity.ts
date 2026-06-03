import { STRING_LIMITS } from "src/common/constants/schema.constants";
import { Column, Entity, OneToMany, OneToOne } from "typeorm";
import { BaseEntity } from "../../common/entities/base.entity";
import { EventAccess } from "../../events/entities/event-access.entity";
import { Event } from "../../events/entities/event.entity";
import { Photo } from "../../photos/entities/photo.entity";
import { UserAuth } from "./user-auth.entity";

@Entity("users")
export class User extends BaseEntity {
  @Column({ type: "varchar", length: STRING_LIMITS.STANDARD, unique: true })
  email: string;

  @Column({ type: "varchar", length: STRING_LIMITS.STANDARD })
  name: string;

  @OneToOne(() => UserAuth, (userAuth) => userAuth.user, { cascade: true })
  auth: UserAuth;

  @OneToMany(() => Event, (event) => event.creator)
  createdEvents: Event[];

  @OneToMany(() => EventAccess, (eventAccess) => eventAccess.user)
  eventAccesses: EventAccess[];

  @OneToMany(() => Photo, (photo) => photo.addedBy)
  photos: Photo[];
}
