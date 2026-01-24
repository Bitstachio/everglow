import { Entity, Column, OneToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { UserAuth } from './user-auth.entity';
import { Event } from '../../events/entities/event.entity';
import { Photo } from '../../photos/entities/photo.entity';
import { EventAccess } from '../../events/entities/event-access.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 100, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @OneToOne(() => UserAuth, (userAuth) => userAuth.user, { cascade: true })
  auth: UserAuth;

  @OneToMany(() => Event, (event) => event.creator)
  createdEvents: Event[];

  @OneToMany(() => Photo, (photo) => photo.addedBy)
  photos: Photo[];

  @OneToMany(() => EventAccess, (eventAccess) => eventAccess.user)
  eventAccesses: EventAccess[];
}
