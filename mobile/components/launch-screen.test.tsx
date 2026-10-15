import { renderWithI18n } from "@/testing/render";
import { act, screen } from "@testing-library/react-native";
import { LaunchCurtain, LaunchScreen } from "./launch-screen";

let mockPathname = "/";
jest.mock("expo-router", () => ({ usePathname: () => mockPathname }));
jest.mock("expo-splash-screen", () => ({ hideAsync: jest.fn(async () => undefined) }));

beforeEach(() => {
  mockPathname = "/";
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

test("shows the name and says the session is loading", async () => {
  await renderWithI18n(<LaunchScreen />);
  const launch = screen.getByRole("progressbar", { name: "Loading the roll" });
  expect(launch).toBeOnTheScreen();
  expect(launch).toBeBusy();
});

test("the curtain covers the start route and lifts once the first screen is reached", async () => {
  const { rerender } = await renderWithI18n(<LaunchCurtain />);
  expect(screen.getByRole("progressbar")).toBeOnTheScreen();

  mockPathname = "/login";
  await rerender(<LaunchCurtain />);
  await act(async () => jest.advanceTimersByTime(400));
  expect(screen.queryByRole("progressbar")).not.toBeOnTheScreen();
});

test("the curtain lifts anyway if the start route never redirects", async () => {
  await renderWithI18n(<LaunchCurtain />);
  await act(async () => jest.advanceTimersByTime(1600));
  expect(screen.getByRole("progressbar")).toBeOnTheScreen();
  await act(async () => jest.advanceTimersByTime(400));
  expect(screen.queryByRole("progressbar")).not.toBeOnTheScreen();
});
