import { INestApplication } from "@nestjs/common";
import { Test, TestingModuleBuilder } from "@nestjs/testing";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PrismaClient } from "generated/prisma/client";
import { AppModule } from "src/app.module";
import { configureApp } from "src/app.setup";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { PrismaService } from "src/prisma/prisma.service";
import { TestJwtAuthGuard } from "./test-jwt-auth.guard";

export type TestAppContext = {
  app: INestApplication;
  prisma: DeepMockProxy<PrismaClient>;
};

export async function createTestApp(
  configureModule?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<TestAppContext> {
  const prisma = mockDeep<PrismaClient>();

  let builder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideGuard(JwtAuthGuard)
    .useClass(TestJwtAuthGuard)
    .overrideProvider(PrismaService)
    .useValue(prisma);

  if (configureModule) {
    builder = configureModule(builder);
  }

  const moduleFixture = await builder.compile();
  const app = moduleFixture.createNestApplication();

  configureApp(app);

  await app.init();

  return { app, prisma };
}
