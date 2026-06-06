import * as bcrypt from "bcrypt";
import { BaseEntity } from "../../common/entities/base.entity";
import { User } from "./user.entity";

// TypeORM decorators removed — plain model until Prisma migration.
export class UserAuth extends BaseEntity {
  userId: string;
  passwordHash: string;
  refreshToken: string | null;
  user?: User;

  // Previously @BeforeInsert / @BeforeUpdate — move to AuthService when using Prisma.
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
