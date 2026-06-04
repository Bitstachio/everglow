import { Entity, Column, ManyToOne, OneToMany, JoinColumn, BeforeInsert } from "typeorm";
import * as crypto from "crypto";
import { BaseEntity } from "../../common/entities/base.entity";
import { User } from "../../users/entities/user.entity";
import { Photo } from "../../photos/entities/photo.entity";
import { EventAccess } from "./event-access.entity";

@Entity("events")
export class Event extends BaseEntity {
  @Column({ type: "varchar", length: 200 })
  title: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "datetime" })
  date: Date;

  @Column({ name: "creator_id" })
  creatorId: string;

  @Column({
    name: "invitation_url",
    type: "varchar",
    length: 100,
    unique: true,
  })
  invitationUrl: string;

  @ManyToOne(() => User, (user) => user.createdEvents)
  @JoinColumn({ name: "creator_id" })
  creator: User;

  @OneToMany(() => Photo, (photo) => photo.event)
  photos: Photo[];

  @OneToMany(() => EventAccess, (eventAccess) => eventAccess.event)
  eventAccesses: EventAccess[];

  @BeforeInsert()
  generateInvitationUrl() {
    if (!this.invitationUrl) {
      this.invitationUrl = crypto.randomBytes(16).toString("hex"); // for QR code
    }
  }
}
