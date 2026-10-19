import { render, screen } from "@testing-library/react-native";
import Index from "@/app/index";

let mockAuth = { isAuthenticated: false, isOnboarded: false, isSuspended: false };

jest.mock("@/context/auth-context", () => ({ useAuth: () => mockAuth }));
jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual("react-native");
    return <Text>{href}</Text>;
  },
}));

test.each([
  { isAuthenticated: false, isOnboarded: false, isSuspended: false, destination: "/login" },
  { isAuthenticated: true, isOnboarded: false, isSuspended: false, destination: "/onboarding" },
  { isAuthenticated: true, isOnboarded: true, isSuspended: false, destination: "/events" },
  { isAuthenticated: true, isOnboarded: true, isSuspended: true, destination: "/account-suspended" },
])("routes $isAuthenticated/$isOnboarded/$isSuspended to $destination on launch", async ({ destination, ...auth }) => {
  mockAuth = auth;
  await render(<Index />);
  expect(screen.getByText(destination)).toBeOnTheScreen();
});
