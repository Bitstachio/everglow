import { render, screen } from "@testing-library/react-native";
import Index from "@/app/index";

let mockAuth = { isAuthenticated: false, isOnboarded: false };

jest.mock("@/context/auth-context", () => ({ useAuth: () => mockAuth }));
jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual("react-native");
    return <Text>{href}</Text>;
  },
}));

test.each([
  { isAuthenticated: false, isOnboarded: false, destination: "/login" },
  { isAuthenticated: true, isOnboarded: false, destination: "/onboarding" },
  { isAuthenticated: true, isOnboarded: true, destination: "/events" },
])("routes $isAuthenticated/$isOnboarded to $destination on launch", async ({ destination, ...auth }) => {
  mockAuth = auth;
  await render(<Index />);
  expect(screen.getByText(destination)).toBeOnTheScreen();
});
