import { INestApplication } from "@nestjs/common";
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
