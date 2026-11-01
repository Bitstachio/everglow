import { Global, Module } from "@nestjs/common";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { StorageModule } from "src/storage/storage.module";
import { EvidenceOrphanSource } from "./evidence-orphan-source";
import { EvidenceScheduler } from "./evidence.scheduler";
import { EvidenceService } from "./evidence.service";
import { MemberlessEventPurgeService } from "./memberless-event-purge.service";

/**
 * Evidence of reported content (docs/moderation.md §7). Global because every
 * path that deletes a photo or a cover asks it first, across the photos,
 * events, images and users modules, and it depends on nothing but Prisma and
 * S3, so it can't take part in a cycle.
 */
@Global()
@Module({
  imports: [StorageModule],
  // PhotoPurgeService is stateless; provided here for the memberless-event
  // purge, as ModerationModule does, since importing PhotosModule would be a cycle.
  providers: [EvidenceService, EvidenceOrphanSource, EvidenceScheduler, MemberlessEventPurgeService, PhotoPurgeService],
  exports: [EvidenceService],
})
export class EvidenceModule {}
