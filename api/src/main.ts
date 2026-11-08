import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { SWAGGER_PATH, servesSwagger, setupSwagger } from "./swagger/swagger.config";

const bootstrap = async () => {
  const app = await NestFactory.create(AppModule);

  app.useLogger(app.get(Logger));
  configureApp(app);
  app.enableCors();
  const swagger = servesSwagger(process.env.NODE_ENV);
  if (swagger) setupSwagger(app);
  const port = process.env.PORT || 3000;
  await app.listen(port, "0.0.0.0");
  console.log(`Application is running on: http://localhost:${port}`);
  if (swagger) console.log(`Swagger docs available at: http://localhost:${port}/${SWAGGER_PATH}`);
};
void bootstrap();
