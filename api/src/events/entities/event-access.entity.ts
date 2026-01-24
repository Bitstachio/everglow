import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Event } from './event.entity';

export enum AccessLevel {
  ADMIN = 0,
  CONTRIBUTOR = 1,
  VIEWER = 2,
}

@Entity('event_access')
@Index(['userId', 'eventId'], { unique: true })
export class EventAccess extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'event_id' })
  eventId: string;

  @Column({ name: 'access_level', type: 'int', default: AccessLevel.VIEWER })
  accessLevel: AccessLevel;

  @ManyToOne(() => User, (user) => user.eventAccesses)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Event, (event) => event.eventAccesses)
  @JoinColumn({ name: 'event_id' })
  event: Event;
}
