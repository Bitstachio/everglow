import { toApiError } from "@/lib/api/errors";
import { authService } from "./auth";

const mockFindMe = jest.fn();
jest.mock("@/lib/api/generated", () => ({
  usersControllerFindMe: () => mockFindMe(),
  usersControllerCompleteOnboarding: jest.fn(),
}));

test("a connection failure is thrown so the caller can retry", async () => {
  const offline = toApiError({ request: {}, message: "Network Error" });
  mockFindMe.mockRejectedValue(offline);
  await expect(authService.getUserProfile()).rejects.toBe(offline);
});

test("a refusal from the API reads as no profile", async () => {
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  mockFindMe.mockRejectedValue(toApiError({ response: { status: 404, data: { code: "NOT_FOUND" } } }));
  await expect(authService.getUserProfile()).resolves.toBeNull();
});
