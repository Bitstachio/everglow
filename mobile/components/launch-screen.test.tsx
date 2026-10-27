import { renderWithI18n } from "@/testing/render";
import { act, fireEvent, screen } from "@testing-library/react-native";
import * as SplashScreen from "expo-splash-screen";
import { LaunchCurtain, LaunchScreen } from "./launch-screen";

let mockPathname = "/";
jest.mock("expo-router", () => ({ usePathname: () => mockPathname }));
jest.mock("expo-splash-screen", () => ({ hideAsync: jest.fn(async () => undefined) }));

beforeEach(() => {
  mockPathname = "/";
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

test("shows the name and says the session is loading, to screen readers only", async () => {
  await renderWithI18n(<LaunchScreen />);
  const launch = screen.getByRole("progressbar", { name: "Loading the roll" });
  expect(launch).toBeOnTheScreen();
  expect(launch).toBeBusy();
  expect(screen.queryByText("Loading the roll")).not.toBeOnTheScreen();
});

test.each(["load", "error"])("hides the native splash once its image fires %s, never before", async (event) => {
  await renderWithI18n(<LaunchScreen />);
  expect(SplashScreen.hideAsync).not.toHaveBeenCalled();

  fireEvent(screen.getByTestId("launch-wordmark"), event);

  expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
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
