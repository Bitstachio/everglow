import { createAxiosInstance, setSuspendedHandler, setUnauthorizedHandler } from "./axios-instance";

jest.mock("@/lib/auth0", () => ({ getAccessToken: async () => null }));

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
