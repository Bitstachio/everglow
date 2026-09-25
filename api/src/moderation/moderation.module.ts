import { Module } from "@nestjs/common";
import { CaslModule } from "src/casl/casl.module";
import { BlocksController } from "./blocks.controller";
import { BlocksService } from "./blocks.service";
import { PhotoVisibilityService } from "./photo-visibility.service";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [CaslModule],
  controllers: [ReportsController, BlocksController],
  providers: [ReportsService, BlocksService, PhotoVisibilityService],
  // The photo read paths are the only consumer outside this module.
  exports: [PhotoVisibilityService],
})
export class ModerationModule {}
