import { Module } from "@nestjs/common";
import { ModerationModule } from "../moderation.module";
import { PlatformModerationController } from "./platform-moderation.controller";
import { PlatformModerationService } from "./platform-moderation.service";
import { PlatformModeratorGuard } from "./platform-moderator.guard";

/** The platform's moderation tools under /admin (docs/moderation.md §8). */
@Module({
  imports: [ModerationModule],
  controllers: [PlatformModerationController],
  providers: [PlatformModerationService, PlatformModeratorGuard],
})
export class PlatformModerationModule {}
