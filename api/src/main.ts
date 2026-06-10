import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { SWAGGER_PATH, setupSwagger } from "./swagger/swagger.config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);
  app.enableCors();
  setupSwagger(app);
  const port = process.env.PORT || 3000;
  await app.listen(port, "0.0.0.0");
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger docs available at: http://localhost:${port}/${SWAGGER_PATH}`);
}
void bootstrap();
