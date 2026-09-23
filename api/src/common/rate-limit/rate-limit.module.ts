import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { RateLimitRejectionLogger } from "./rate-limit-rejection.logger";
import { IpRateLimitGuard } from "./rate-limit.guard";
import { createRateLimitStorage } from "./rate-limit.storage";

/**
 * Global so `@RateLimit(...)` works in any feature module without an import:
 * the guard it attaches is instantiated inside the host module and resolves
 * its dependencies (throttler storage, rejection logger) from here.
 */
@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      // A factory so every application instance gets its own storage.
      useFactory: () => ({
        // Tiers are resolved per request by our guards from the `rateLimit`
        // config, so throttler's apply-every-throttler-to-every-route list stays empty.
        throttlers: [],
        storage: createRateLimitStorage(),
      }),
    }),
  ],
  providers: [RateLimitRejectionLogger, { provide: APP_GUARD, useClass: IpRateLimitGuard }],
  exports: [RateLimitRejectionLogger],
})
export class RateLimitModule {}
