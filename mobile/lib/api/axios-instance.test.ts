import { isConnectionError } from "@/lib/api/errors";
import { createAxiosInstance, setSuspendedHandler, setUnauthorizedHandler } from "./axios-instance";

const mockGetAccessToken = jest.fn();
jest.mock("@/lib/auth0", () => ({
  getAccessToken: () => mockGetAccessToken(),
  isTokenRenewalOffline: (error: unknown) => error instanceof Error && error.name === "TokenRenewalOffline",
}));

const onUnauthorized = jest.fn();
const onSuspended = jest.fn();

// The response interceptor's rejection handler, called the way Axios would.
const fail = (status: number, code?: string) => {
  const { handlers } = createAxiosInstance().interceptors.response as unknown as {
    handlers: { rejected: (error: unknown) => Promise<never> }[];
  };
  return handlers[0].rejected({ response: { status, data: { code } } }).catch((error: unknown) => error);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAccessToken.mockResolvedValue(null);
  setUnauthorizedHandler(onUnauthorized);
  setSuspendedHandler(onSuspended);
});

afterAll(() => {
  setUnauthorizedHandler(null);
  setSuspendedHandler(null);
});

test("a 401 calls the session-expired handler", async () => {
  await fail(401);
  expect(onUnauthorized).toHaveBeenCalledTimes(1);
  expect(onSuspended).not.toHaveBeenCalled();
});

test("a 403 ACCOUNT_SUSPENDED calls the suspended handler and still rejects with the code", async () => {
  const error = await fail(403, "ACCOUNT_SUSPENDED");
  expect(onSuspended).toHaveBeenCalledTimes(1);
  expect(onUnauthorized).not.toHaveBeenCalled();
  expect(error).toMatchObject({ status: 403, code: "ACCOUNT_SUSPENDED" });
});

test("any other refusal calls neither", async () => {
  await fail(403, "EVENT_SUSPENDED");
  expect(onSuspended).not.toHaveBeenCalled();
  expect(onUnauthorized).not.toHaveBeenCalled();
});

type Config = { headers: Record<string, string> };

// The request interceptor's fulfilled handler, called the way Axios would.
const prepare = () => {
  const { handlers } = createAxiosInstance().interceptors.request as unknown as {
    handlers: { fulfilled: (config: Config) => Promise<Config> }[];
  };
  return handlers[0].fulfilled({ headers: {} });
};

test("a request carries the access token", async () => {
  mockGetAccessToken.mockResolvedValue("access");
  await expect(prepare()).resolves.toMatchObject({ headers: { Authorization: "Bearer access" } });
});

test("a token that can't be renewed offline fails the request as a connection error, never unauthenticated", async () => {
  mockGetAccessToken.mockRejectedValue(Object.assign(new Error("offline"), { name: "TokenRenewalOffline" }));

  const error = await prepare().catch((caught: unknown) => caught);

  expect(isConnectionError(error)).toBe(true);
  expect(onUnauthorized).not.toHaveBeenCalled();
});
