import { renderHook, act } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useChangePassword } from "./use-change-password";

const mockMutateAsync = jest.fn();
const mockOpenTicket = jest.fn();
const mockSessionStillValid = jest.fn();
const mockEndExpiredSession = jest.fn();
let mockSub: string | undefined = "auth0|user-1";

jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({
    identity: mockSub ? { sub: mockSub } : null,
    endExpiredSession: () => mockEndExpiredSession(),
  }),
}));
jest.mock("../api/mutations", () => ({
  useCreatePasswordChangeTicketMutation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));
jest.mock("@/lib/auth0", () => ({
  openPasswordChangeTicket: (...args: unknown[]) => mockOpenTicket(...args),
  sessionStillValid: (...args: unknown[]) => mockSessionStillValid(...args),
}));
jest.mock("@/lib/auth0-identity", () => ({
  isDatabaseIdentity: (sub: string | null | undefined) => typeof sub === "string" && sub.startsWith("auth0|"),
}));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

beforeEach(() => {
  jest.clearAllMocks();
  mockSub = "auth0|user-1";
  mockMutateAsync.mockResolvedValue({ ticketUrl: "https://auth0.example/ticket" });
  mockOpenTicket.mockResolvedValue({ type: "success", url: "everglowmobile://password-change/result" });
  mockSessionStillValid.mockResolvedValue(true);
  mockEndExpiredSession.mockResolvedValue(undefined);
});

test("opens the Auth0 ticket URL for a database identity", async () => {
  const { result } = await renderHook(() => useChangePassword());
  expect(result.current.canChangePassword).toBe(true);

  await act(async () => {
    await result.current.handleChangePassword();
  });

  expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  expect(mockOpenTicket).toHaveBeenCalledWith("https://auth0.example/ticket");
  expect(mockEndExpiredSession).not.toHaveBeenCalled();
});

test("ends the session through the auth context when credentials die after the change", async () => {
  mockSessionStillValid.mockResolvedValue(false);
  const { result } = await renderHook(() => useChangePassword());

  await act(async () => {
    await result.current.handleChangePassword();
  });

  expect(mockEndExpiredSession).toHaveBeenCalledTimes(1);
  expect(alert).not.toHaveBeenCalled();
});

test("rejects social identities without calling the API", async () => {
  mockSub = "apple|001.abc";
  const { result } = await renderHook(() => useChangePassword());
  expect(result.current.canChangePassword).toBe(false);

  await act(async () => {
    await result.current.handleChangePassword();
  });

  expect(mockMutateAsync).not.toHaveBeenCalled();
  expect(mockOpenTicket).not.toHaveBeenCalled();
});

test("shows an error when ticket minting fails", async () => {
  mockMutateAsync.mockRejectedValue(new Error("Offline"));
  const { result } = await renderHook(() => useChangePassword());

  await act(async () => {
    await result.current.handleChangePassword();
  });

  expect(alert).toHaveBeenCalledWith("Could not change password", "Please try again.");
  expect(mockOpenTicket).not.toHaveBeenCalled();
});

test("ignores overlapping presses while a change is in flight", async () => {
  let resolveTicket!: (value: { ticketUrl: string }) => void;
  mockMutateAsync.mockReturnValue(
    new Promise<{ ticketUrl: string }>((resolve) => {
      resolveTicket = resolve;
    }),
  );
  const { result } = await renderHook(() => useChangePassword());

  let first!: Promise<void>;
  await act(async () => {
    first = result.current.handleChangePassword();
  });
  await act(async () => {
    await result.current.handleChangePassword();
  });

  expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveTicket({ ticketUrl: "https://auth0.example/ticket" });
    await first;
  });
});
