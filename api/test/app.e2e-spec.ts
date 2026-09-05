import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Server } from "http";
import request from "supertest";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import { createTestApp } from "./helpers/create-test-app";

describe("AppController (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
  });

  afterAll(async () => {
    await app.close();
  });

  // The photo cleanup scheduler reads its config only when the cron fires, so an
  // unregistered namespace would surface in production rather than in any test.
  // Booting the real AppModule and resolving the keys is what catches it here.
  it("registers the photos config namespace the background jobs depend on", () => {
    const configService = app.get(ConfigService);

    expect(configService.get("photos.pendingCleanupMaxAgeHours")).toEqual(expect.any(Number));
    expect(configService.get("photos.pendingCleanupBatchSize")).toEqual(expect.any(Number));
    expect(configService.get("photos.pendingCleanupEnabled")).toEqual(expect.any(Boolean));
  });

  it(`GET /${API_GLOBAL_PREFIX} returns Hello World`, async () => {
    const response = await request(app.getHttpServer() as Server)
      .get(`/${API_GLOBAL_PREFIX}`)
      .expect(200);

    const body = response.body as {
      data: string;
      meta: { timestamp: string; path: string };
    };

    expect(body).toMatchObject({
      data: "Hello World!",
      meta: {
        path: `/${API_GLOBAL_PREFIX}`,
      },
    });
    expect(typeof body.meta.timestamp).toBe("string");
  });
});
