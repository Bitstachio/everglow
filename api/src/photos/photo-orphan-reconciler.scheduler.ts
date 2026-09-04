import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";
import { PhotoOrphanReconcilerService } from "./photo-orphan-reconciler.service";

@Injectable()
export class PhotoOrphanReconcilerScheduler {
  constructor(
    private readonly reconcilerService: PhotoOrphanReconcilerService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  // Daily, off-peak: every run lists the whole photos/ prefix, which is not
  // worth doing hourly, and orphans cost money rather than correctness.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleReconcile(): Promise<void> {
    if (!this.configService.get<boolean>("photos.orphanReconcilerEnabled")) return;

    try {
      await this.reconcilerService.reconcileOrphanedObjects();
    } catch (error) {
      this.logger.error(
        { err: error as Error, event: "photo.orphan_reconcile.run_failed" },
        "Orphaned photo object reconcile run failed",
      );
    }
  }
}
