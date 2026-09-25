import { Module } from "@nestjs/common";
import { BlocksController } from "./blocks.controller";
import { BlocksService } from "./blocks.service";
import { PhotoVisibilityService } from "./photo-visibility.service";

@Module({
  controllers: [BlocksController],
  providers: [BlocksService, PhotoVisibilityService],
  // The photo read paths are the only consumer outside this module.
  exports: [PhotoVisibilityService],
})
export class ModerationModule {}
