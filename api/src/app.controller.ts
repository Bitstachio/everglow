import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";
import { SkipRateLimit } from "./common/rate-limit/rate-limit.decorator";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Liveness-style probe: must keep answering while a caller is being throttled.
  @Get()
  @SkipRateLimit()
  getHello(): string {
    return this.appService.getHello();
  }
}
