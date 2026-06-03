import * as bcrypt from "bcrypt";
import { STRING_LIMITS } from "src/common/constants/schema.constants";
import { BeforeInsert, BeforeUpdate, Column, Entity, JoinColumn, OneToOne } from "typeorm";
import { BaseEntity } from "../../common/entities/base.entity";
import { User } from "./user.entity";

@Entity("user_auth")
export class UserAuth extends BaseEntity {
  @Column({ name: "user_id", unique: true })
  userId: string;

  @Column({ name: "password_hash", length: STRING_LIMITS.STANDARD })
  passwordHash: string;

  @Column({ name: "refresh_token", type: "text", nullable: true })
  refreshToken: string | null;

  @OneToOne(() => User, (user) => user.auth, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    if (this.passwordHash && !this.passwordHash.startsWith("$2")) {
      const salt = await bcrypt.genSalt(10);
      this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    }
  }

  async comparePassword(candidatePassword: string): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.passwordHash);
  }
}
