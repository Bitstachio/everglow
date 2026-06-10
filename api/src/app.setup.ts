import { INestApplication, ValidationPipe } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import { API_GLOBAL_PREFIX } from "./swagger/swagger.config";

/**
 * Global app configuration shared between the production bootstrap (main.ts)
 * and the E2E test app factory, so tests always run against the same
 * pipes/filters/interceptors as production.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalInterceptors(new ResponseInterceptor());

  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.setGlobalPrefix(API_GLOBAL_PREFIX);
}
