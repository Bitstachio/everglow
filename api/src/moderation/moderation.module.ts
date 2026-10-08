import { Module } from "@nestjs/common";
import { CaslModule } from "src/casl/casl.module";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { BlocksController } from "./blocks.controller";
import { BlocksService } from "./blocks.service";
import { PhotoVisibilityService } from "./photo-visibility.service";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { RekognitionService } from "src/sdk/aws/rekognition/rekognition.service";
import { UploadScreeningService } from "./screening/upload-screening.service";
import { StaleReportCheckScheduler } from "./stale-report-check.scheduler";

@Module({
  imports: [CaslModule],
  controllers: [ReportsController, BlocksController],
  // PhotoPurgeService is stateless and needs only the global S3Service; it is
  // provided here directly because importing PhotosModule would be a cycle.
  providers: [
    ReportsService,
    BlocksService,
    PhotoVisibilityService,
    PhotoPurgeService,
    StaleReportCheckScheduler,
    RekognitionService,
    UploadScreeningService,
  ],
  // The photo read paths use the visibility filter; the platform tools give
  // verdicts through ReportsService.
  // Upload confirmation screens new photos.
  exports: [PhotoVisibilityService, ReportsService, UploadScreeningService],
})
export class ModerationModule {}
