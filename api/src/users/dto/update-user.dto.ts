import { PartialType, PickType } from "@nestjs/swagger";
import { CreateUserDetailsDto } from "./create-user-details.dto";

export class UpdateUserDto extends PartialType(
  PickType(CreateUserDetailsDto, ["name", "email", "username"] as const),
) {}
