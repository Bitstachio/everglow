import { PickType } from "@nestjs/swagger";
import { UpdateEventDto } from "src/events/dto/update-event.dto";

/** The smaller fixes the platform makes to a reported event: its title, or its description (null removes it). */
export class EditEventAsPlatformDto extends PickType(UpdateEventDto, ["title", "description"] as const) {}
