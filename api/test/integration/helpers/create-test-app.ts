import { INestApplication } from "@nestjs/common";
import { Test, TestingModuleBuilder } from "@nestjs/testing";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PrismaClient } from "generated/prisma/client";
import { AppModule } from "src/app.module";
import { configureApp } from "src/app.setup";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { JwtStrategy } from "src/auth/jwt.strategy";
import { EvidenceService } from "src/moderation/evidence/evidence.service";
import { buildEvidenceServiceMock, EvidenceServiceMock } from "src/moderation/evidence/testing/evidence-service.mock";
import { NotificationsService } from "src/notifications/notifications.service";
import { PrismaService } from "src/prisma/prisma.service";
import { TestJwtAuthGuard } from "./test-jwt-auth.guard";

export type TestAppContext = {
  app: INestApplication;
  prisma: DeepMockProxy<PrismaClient>;
  /** Nothing is reported unless a test says so: every object may be deleted. */
  evidence: EvidenceServiceMock;
};

/** Outbox writes need a real Notification table; these suites mock Prisma. */
const notificationsStub = {
  notify: jest.fn().mockResolvedValue(0),
  notifyNow: jest.fn().mockResolvedValue(0),
  kick: jest.fn(),
};

export const createTestApp = async (
  configureModule?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<TestAppContext> => {
  const prisma = mockDeep<PrismaClient>();
  const evidence = buildEvidenceServiceMock();

  let builder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideGuard(JwtAuthGuard)
    .useClass(TestJwtAuthGuard)
    .overrideProvider(JwtStrategy)
    .useValue({ validate: jest.fn() })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(EvidenceService)
    .useValue(evidence)
    .overrideProvider(NotificationsService)
    .useValue(notificationsStub);

  if (configureModule) {
    builder = configureModule(builder);
  }

  const moduleFixture = await builder.compile();
  const app = moduleFixture.createNestApplication();

  configureApp(app);

  await app.init();

  return { app, prisma, evidence };
};
