import { clearPendingInvite, savePendingInvite } from "@/lib/pending-invite";
import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import OnboardingReadyScreen from "./onboarding-ready-screen";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ router: { replace: (href: unknown) => mockReplace(href) } }));

jest.mock("../hooks/use-lab-card", () => ({
  useLabCard: () => ({
    firstName: "Maya",
    card: {
      title: "Lab card · since Oct 2026",
      fields: [{ label: "Name", value: "Maya Chen" }],
      accessibilityLabel: "Your lab card: Maya Chen, @maya.chen",
    },
  }),
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderReady = () =>
  renderWithI18n(<OnboardingReadyScreen />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
    ),
  });

beforeEach(() => {
  mockReplace.mockReset();
  clearPendingInvite();
});

test("shows the finished card and goes to Home", async () => {
  const user = userEvent.setup();
  await renderReady();

  expect(screen.getByLabelText("Your lab card: Maya Chen, @maya.chen")).toBeOnTheScreen();
  expect(screen.getByRole("header", { name: "You’re set,\nMaya." })).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Go to your rolls" }));
  expect(mockReplace).toHaveBeenCalledWith("/events");
});

test("opens the envelope that brought them, once onboarding is done (06.3)", async () => {
  savePendingInvite("k8Qm2");
  await renderReady();
  await userEvent.setup().press(screen.getByRole("button", { name: "Go to your rolls" }));
  expect(mockReplace).toHaveBeenCalledWith("/join/k8Qm2");
});
