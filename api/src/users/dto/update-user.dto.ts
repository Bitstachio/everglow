import { PartialType, PickType } from "@nestjs/swagger";
import { CreateUserDto } from "./create-user.dto";

export class UpdateUserDto extends PartialType(PickType(CreateUserDto, ["name", "email"] as const)) {}
