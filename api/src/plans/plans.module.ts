import { Module } from "@nestjs/common";
import { EventPlanService } from "./event-plan.service";

@Module({
  providers: [EventPlanService],
  exports: [EventPlanService],
})
export class PlansModule {}
