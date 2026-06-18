import { Module } from "@nestjs/common";
import { CaslModule } from "src/casl/casl.module";
import { EventsService } from "./events.service";

@Module({
  imports: [CaslModule],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
