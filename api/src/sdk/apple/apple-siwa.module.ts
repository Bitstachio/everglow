import { Global, Module } from "@nestjs/common";
import { AppleSiwaService } from "./apple-siwa.service";

@Global()
@Module({
  providers: [AppleSiwaService],
  exports: [AppleSiwaService],
})
export class AppleSiwaModule {}
