import { Module } from "@nestjs/common";
import { RekognitionModule } from "src/sdk/aws/rekognition/rekognition.module";
import { UploadScreeningService } from "./upload-screening.service";

/** Upload screening (docs/moderation.md §11). Upload confirm screens through UploadScreeningService. */
@Module({
  imports: [RekognitionModule],
  providers: [UploadScreeningService],
  exports: [UploadScreeningService],
})
export class ScreeningModule {}
