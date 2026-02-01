import { STRING_LIMITS } from "src/common/constants/schema.constants";
import { Column, Entity, JoinColumn, OneToOne } from "typeorm";
import { BaseEntity } from "../../common/entities/base.entity";
import { User } from "./user.entity";

@Entity("user_auth")
export class UserAuth extends BaseEntity {
  @Column({ name: "user_id", unique: true })
  userId: string;

  @Column({ name: "password_hash", length: STRING_LIMITS.STANDARD })
  passwordHash: string;

  @Column({ name: "refresh_token_hash", length: STRING_LIMITS.STANDARD, nullable: true })
  refreshTokenHash: string | null;

  @OneToOne(() => User, (user) => user.auth, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;
}
