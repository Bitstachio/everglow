import { STRING_LIMITS } from "src/common/constants/schema.constants";
import { Column, Entity } from "typeorm";
import { BaseEntity } from "../../common/entities/base.entity";

@Entity("users")
export class User extends BaseEntity {
  @Column({ type: "varchar", length: STRING_LIMITS.STANDARD, unique: true })
  email: string;

  @Column({ type: "varchar", length: STRING_LIMITS.STANDARD })
  name: string;
}
