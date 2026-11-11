import { Module } from "@nestjs/common";
import { RekognitionService } from "./rekognition.service";

@Module({
  providers: [RekognitionService],
  exports: [RekognitionService],
})
export class RekognitionModule {}
