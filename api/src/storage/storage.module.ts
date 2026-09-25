import { Module } from "@nestjs/common";
import { OrphanSourceRegistry } from "./orphan-source.registry";
import { S3OrphanReconcilerScheduler } from "./s3-orphan-reconciler.scheduler";
import { S3OrphanReconcilerService } from "./s3-orphan-reconciler.service";

/**
 * Bucket-wide housekeeping that belongs to no single feature. Feature modules
 * import it to register their S3 prefix with the orphan reconciler.
 */
@Module({
  providers: [OrphanSourceRegistry, S3OrphanReconcilerService, S3OrphanReconcilerScheduler],
  exports: [OrphanSourceRegistry],
})
export class StorageModule {}
