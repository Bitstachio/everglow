import { ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";

/**
 * The one place that decides where hit counters live. Guards and controllers
 * only ever see the `ThrottlerStorage` interface, so moving to a shared store
 * (Redis) is a change to this function alone.
 *
 * In-memory counters are per process: with N instances behind a load balancer
 * a caller effectively gets N times each limit. See docs/rate-limiting.md.
 */
export const createRateLimitStorage = (): ThrottlerStorage => new ThrottlerStorageService();
