import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger";

export const API_GLOBAL_PREFIX = "api/v2";
export const SWAGGER_PATH = "api/docs";

export function buildSwaggerConfig() {
  return new DocumentBuilder()
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
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, buildSwaggerConfig());
}

export function setupSwagger(app: INestApplication): OpenAPIObject {
  const document = createOpenApiDocument(app);
  SwaggerModule.setup(SWAGGER_PATH, app, document);
  return document;
}
