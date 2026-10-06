import { Module } from "@nestjs/common";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { ModerationModule } from "../moderation.module";
import { PlatformEnforcementService } from "./platform-enforcement.service";
import { PlatformModerationController } from "./platform-moderation.controller";
import { PlatformModerationService } from "./platform-moderation.service";
import { PlatformModeratorGuard } from "./platform-moderator.guard";

/** The platform's moderation tools under /admin (docs/moderation.md §8). */
@Module({
  imports: [ModerationModule],
  controllers: [PlatformModerationController],
  // PhotoPurgeService is stateless; provided here as ModerationModule does.
  providers: [PlatformModerationService, PlatformEnforcementService, PlatformModeratorGuard, PhotoPurgeService],
})
export class PlatformModerationModule {}
