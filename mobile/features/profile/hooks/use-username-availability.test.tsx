import { act, renderHook, waitFor } from "@testing-library/react-native";
import { ApiError } from "@/lib/api/errors";
import { useUsernameAvailability } from "./use-username-availability";

const mockCheck = jest.fn();
jest.mock("@/lib/api/generated", () => ({
  usersControllerCheckUsernameAvailability: (...args: unknown[]) => mockCheck(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockCheck.mockResolvedValue({
    data: { data: { username: "ada.lovelace", available: true, reason: null }, meta: {} },
  });
});

afterEach(() => {
  jest.useRealTimers();
});

test("treats the current username as available without calling the API", async () => {
  const { result } = await renderHook(() =>
    useUsernameAvailability("ada.lovelace", { currentUsername: "ada.lovelace" }),
  );

  expect(result.current).toMatchObject({ status: "available", canSubmit: true });
  expect(mockCheck).not.toHaveBeenCalled();
});

test("short-circuits invalid format without calling the API", async () => {
  const { result } = await renderHook(() => useUsernameAvailability("ab"));

  expect(result.current).toMatchObject({
    status: "unavailable",
    reason: "INVALID_FORMAT",
    canSubmit: false,
  });
  expect(mockCheck).not.toHaveBeenCalled();
});

test("debounces and reports an available username", async () => {
  const { result } = await renderHook(() => useUsernameAvailability("ada.lovelace"));

  expect(result.current.status).toBe("checking");
  await act(async () => {
    jest.advanceTimersByTime(300);
  });

  await waitFor(() => expect(result.current.status).toBe("available"));
  expect(result.current.canSubmit).toBe(true);
  expect(mockCheck).toHaveBeenCalledWith(
    expect.objectContaining({ query: { username: "ada.lovelace" }, throwOnError: true }),
  );
});

test("reports taken usernames from the API", async () => {
  mockCheck.mockResolvedValue({
    data: { data: { username: "taken.name", available: false, reason: "TAKEN" }, meta: {} },
  });
  const { result } = await renderHook(() => useUsernameAvailability("taken.name"));

  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  expect(result.current).toMatchObject({ reason: "TAKEN", message: "This username is taken", canSubmit: false });
});

test("pauses after RATE_LIMIT_EXCEEDED until Retry-After elapses", async () => {
  mockCheck.mockRejectedValueOnce(
    new ApiError("Too many requests", { status: 429, code: "RATE_LIMIT_EXCEEDED", retryAfterSeconds: 2 }),
  );
  const { result } = await renderHook(() => useUsernameAvailability("ada.lovelace"));

  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  await waitFor(() => expect(result.current.status).toBe("paused"));
  expect(result.current.canSubmit).toBe(false);

  mockCheck.mockResolvedValue({
    data: { data: { username: "ada.lovelace", available: true, reason: null }, meta: {} },
  });
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  await waitFor(() => expect(result.current.status).toBe("available"));
});
