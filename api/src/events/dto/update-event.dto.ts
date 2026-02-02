import { PartialType, PickType } from "@nestjs/swagger";
import { CreateEventDto } from "./create-event.dto";

export class UpdateEventDto extends PartialType(PickType(CreateEventDto, ["title", "description", "date"] as const)) {}
