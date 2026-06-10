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
    const response = await request(app.getHttpServer() as Server).get(`/${API_GLOBAL_PREFIX}`).expect(200);

    expect(response.body).toEqual({
      data: "Hello World!",
      meta: {
        timestamp: expect.any(String),
        path: `/${API_GLOBAL_PREFIX}`,
      },
    });
  });
});
