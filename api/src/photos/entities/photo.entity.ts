import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Event } from '../../events/entities/event.entity';

@Entity('photos')
export class Photo extends BaseEntity {
  @Column({ name: 'image_url', type: 'varchar', length: 500 })
  imageUrl: string;

  @Column({ name: 'added_by' })
  addedById: string;

  @Column({ name: 'event_id' })
  eventId: string;

  @ManyToOne(() => User, (user) => user.photos)
  @JoinColumn({ name: 'added_by' })
  addedBy: User;

  @ManyToOne(() => Event, (event) => event.photos)
  @JoinColumn({ name: 'event_id' })
  event: Event;
}
