import { renderWithI18n } from "@/testing/render";
import { screen } from "@testing-library/react-native";
import { LaunchScreen } from "./launch-screen";

test("shows the name and says the session is loading", async () => {
  await renderWithI18n(<LaunchScreen />);
  const launch = screen.getByRole("progressbar", { name: "Loading the roll" });
  expect(launch).toBeOnTheScreen();
  expect(launch).toBeBusy();
});
