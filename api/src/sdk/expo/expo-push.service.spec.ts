import { ConfigService } from "@nestjs/config";
import { ExpoPushRequestError, ExpoPushService } from "./expo-push.service";

describe("ExpoPushService", () => {
  const message = { to: "ExponentPushToken[a]", title: "t", body: "b", data: { url: "/" } };
  let fetchMock: jest.SpyInstance;
  let accessToken: string | undefined;

  const service = () => new ExpoPushService({ get: () => accessToken } as unknown as ConfigService);
  const answer = (status: number, body: unknown) =>
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

  beforeEach(() => {
    accessToken = undefined;
    fetchMock = jest.spyOn(global, "fetch");
  });

  afterEach(() => fetchMock.mockRestore());

  it("posts the messages and returns Expo's tickets", async () => {
    answer(200, { data: [{ status: "ok", id: "t1" }] });

    await expect(service().send([message])).resolves.toEqual([{ status: "ok", id: "t1" }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    expect(JSON.parse(init.body as string)).toEqual([message]);
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("sends the access token when one is configured", async () => {
    accessToken = "secret";
    answer(200, { data: [{ status: "ok", id: "t1" }] });

    await service().send([message]);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toHaveProperty("Authorization", "Bearer secret");
  });

  it("makes no request for nothing", async () => {
    await expect(service().send([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["an error status", () => answer(503, { errors: [{ code: "INTERNAL" }] }), 503],
    ["errors in a 200", () => answer(200, { errors: [{ code: "PUSH_TOO_MANY_EXPERIENCE_IDS" }] }), 200],
    ["a ticket count that does not match", () => answer(200, { data: [] }), 200],
    ["no response", () => fetchMock.mockRejectedValue(new Error("ECONNRESET")), null],
  ])("throws a request error for %s", async (_label, arrange, status) => {
    arrange();

    const error = (await service()
      .send([message])
      .catch((e: unknown) => e)) as ExpoPushRequestError;
    expect(error).toBeInstanceOf(ExpoPushRequestError);
    expect(error.status).toBe(status);
  });

  it("looks receipts up by ticket id", async () => {
    answer(200, { data: { t1: { status: "ok" } } });

    await expect(service().getReceipts(["t1"])).resolves.toEqual({ t1: { status: "ok" } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://exp.host/--/api/v2/push/getReceipts");
    expect(JSON.parse(init.body as string)).toEqual({ ids: ["t1"] });
  });
});
