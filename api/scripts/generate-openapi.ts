process.env.OPENAPI_GENERATE = "1";
process.env.AUTH0_DOMAIN ??= "openapi-generate.auth0.com";
process.env.AUTH0_AUDIENCE ??= "https://openapi-generate-api";
// Never connected during generation; only needs to satisfy ConfigService.getOrThrow
process.env.DATABASE_URL ??= "mysql://openapi:openapi@localhost:3306/openapi-generate";

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

async function main() {
  const { NestFactory } = await import("@nestjs/core");
  const { AppModule } = await import("../src/app.module");
  const { API_GLOBAL_PREFIX, createOpenApiDocument } = await import("../src/swagger/swagger.config");

  const app = await NestFactory.create(AppModule, { logger: ["error", "warn"] });
  app.setGlobalPrefix(API_GLOBAL_PREFIX);

  const document = createOpenApiDocument(app);
  const outputDir = join(__dirname, "..", "openapi");
  const outputPath = join(outputDir, "openapi.json");

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

  console.log(`OpenAPI spec written to ${outputPath}`);
  await app.close();
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }
  process.exit(1);
});
