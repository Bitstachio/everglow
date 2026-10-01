import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import { documentApiError } from "src/common/errors/api-error.swagger";
import { documentRateLimitResponses } from "src/common/rate-limit/rate-limit.swagger";

export const API_GLOBAL_PREFIX = "api/v2";
export const SWAGGER_PATH = "api/docs";

export const buildSwaggerConfig = () =>
  new DocumentBuilder()
    .setTitle("Everglow API")
    .setDescription("Photo-sharing platform for events — HTTP API contract (OpenAPI 3)")
    .setVersion("2.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT access token",
      },
      "access-token",
    )
    .build();

export const createOpenApiDocument = (app: INestApplication): OpenAPIObject =>
  documentRateLimitResponses(documentApiError(SwaggerModule.createDocument(app, buildSwaggerConfig())));

export const setupSwagger = (app: INestApplication): OpenAPIObject => {
  const document = createOpenApiDocument(app);
  SwaggerModule.setup(SWAGGER_PATH, app, document);
  return document;
};
