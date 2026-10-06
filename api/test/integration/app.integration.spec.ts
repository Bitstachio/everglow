import { INestApplication, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Server } from "http";
import request from "supertest";
import { BAD_REQUEST_CODE } from "src/common/errors/http.errors";
import { OrphanSourceRegistry } from "src/storage/orphan-source.registry";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import { createTestApp } from "./helpers/create-test-app";

describe("AppController (integration)", () => {
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

  it("registers the storage config namespace the orphan reconciler depends on", () => {
    const configService = app.get(ConfigService);

    expect(configService.get("storage.orphanReconcilerEnabled")).toBe(false);
    expect(configService.get("storage.orphanReconcilerBatchSize")).toEqual(expect.any(Number));
    expect(configService.get("storage.orphanReconcilerMinObjectAgeHours")).toEqual(expect.any(Number));
  });

  // Sources register themselves from onModuleInit; a module that forgets to
  // import StorageModule or to provide its source would leave a prefix unswept.
  it("registers every owned S3 prefix with the orphan reconciler", () => {
    const prefixes = app
      .get(OrphanSourceRegistry, { strict: false })
      .getAll()
      .map((source) => source.prefix);

    expect([...prefixes].sort()).toEqual(["avatars/", "event-covers/", "evidence/", "photos/"]);
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

  // Body parsing runs before any guard, so none of these needs a token. Nest
  // turns only a JSON syntax error into an HTTP exception; the others reach
  // the filter as `http-errors` objects, and must not become a 500 that pages.
  describe("a request body the parser refuses", () => {
    const post = () => request(app.getHttpServer() as Server).post(`/${API_GLOBAL_PREFIX}/events`);
    let errorSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
      warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    });

    afterEach(() => {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it.each<[string, number, () => request.Test]>([
      [
        "a body over the size limit",
        413,
        () =>
          post()
            .set("Content-Type", "application/json")
            .send(`{"name":"${"a".repeat(120_000)}"}`),
      ],
      [
        "a charset it can't read",
        415,
        () => post().set("Content-Type", "application/json; charset=latin9").send('{"name":"x"}'),
      ],
      [
        "a content encoding it can't read",
        415,
        () => post().set("Content-Type", "application/json").set("Content-Encoding", "compress").send('{"name":"x"}'),
      ],
      ["malformed JSON", 400, () => post().set("Content-Type", "application/json").send('{"name":')],
    ])("answers %s with %i and a generic code, not a 500", async (_case, status, send) => {
      const response = await send();

      expect(response.status).toBe(status);
      expect(response.body).toMatchObject({ code: BAD_REQUEST_CODE });
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("logs a refused body at warn, since the access log never sees the request", async () => {
      await post().set("Content-Type", "application/json; charset=latin9").send('{"name":"x"}');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "request.body_rejected",
          method: "POST",
          statusCode: 415,
          errorReason: 'UnsupportedMediaTypeError: unsupported charset "LATIN9"',
        }),
        "Request body rejected",
      );
    });
  });
});
