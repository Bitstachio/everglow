import { I18nProvider } from "@/providers/i18n-provider";
import { renderHook } from "@testing-library/react-native";
import { useLabCard } from "./use-lab-card";

const mockUser = {
  createdAt: "2026-10-15T12:00:00.000Z",
  details: { name: "Maya Chen", username: "maya.chen", avatarUrl: "https://cdn.example/avatar.jpg" },
};
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: mockUser }) }));

let mockLimits: unknown;
jest.mock("../api/queries", () => ({ useMyLimitsQuery: () => ({ data: mockLimits }) }));

const render = () => renderHook(() => useLabCard(), { wrapper: I18nProvider });

test("fills the card from the account and the plan's limit", async () => {
  mockLimits = { plan: "FREE", limits: { activeEvents: 2 }, usage: { activeEvents: 0 } };
  const { result } = await render();

  expect(result.current.firstName).toBe("Maya");
  expect(result.current.card).toMatchObject({
    title: "Lab card · since Oct 2026",
    photoUri: "https://cdn.example/avatar.jpg",
    accessibilityLabel: "Your lab card: Maya Chen, @maya.chen",
    fields: [
      { label: "Name", value: "Maya Chen" },
      { label: "Signs frames as", value: "@maya.chen" },
      { label: "Free roll", value: "0 of 2 running" },
    ],
  });
});

test("leaves the number out when the plan has no limit", async () => {
  mockLimits = { plan: "PLUS", limits: { activeEvents: null }, usage: { activeEvents: 3 } };
  const { result } = await render();
  expect(result.current.card.fields[2]).toEqual({ label: "Rolls", value: "3 running" });
});

test("leaves the rolls line empty until the limits load", async () => {
  mockLimits = undefined;
  const { result } = await render();
  expect(result.current.card.fields[2].value).toBeUndefined();
});
