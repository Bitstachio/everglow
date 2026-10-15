import { renderWithI18n } from "@/testing/render";
import { fireEvent, screen } from "@testing-library/react-native";
import { CantConnectScreen } from "./cant-connect-screen";

test("says the lab is out of reach and retries the last step", async () => {
  const onRetry = jest.fn();
  await renderWithI18n(<CantConnectScreen onRetry={onRetry} isRetrying={false} />);
  expect(screen.getByRole("header", { name: "The lab is out\nof reach." })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test("shows the retry as busy while it runs", async () => {
  await renderWithI18n(<CantConnectScreen onRetry={jest.fn()} isRetrying />);
  expect(screen.getByRole("button", { name: "Try again" })).toBeBusy();
});
