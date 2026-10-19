import { renderWithI18n } from "@/testing/render";
import { screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { RollEnvelope } from "./roll-envelope";

test("fills in the roll's details and ticks what it admits", async () => {
  await renderWithI18n(
    <RollEnvelope
      title="Sam & Jo’s wedding"
      startsAt="Sun 18 Oct, 4 pm"
      peopleCount={24}
      pickUpBy="17 Nov, then it’s gone"
      admits="adds"
      code={<Text>QR</Text>}
      stamp={<Text>Stamp</Text>}
      accessibilityLabel="Envelope for Sam & Jo’s wedding"
    />,
  );

  expect(screen.getByLabelText("Envelope for Sam & Jo’s wedding")).toBeOnTheScreen();
  expect(screen.getByText("Sam & Jo’s wedding")).toBeOnTheScreen();
  expect(screen.getByText("Sun 18 Oct, 4 pm")).toBeOnTheScreen();
  expect(screen.getByText("24 people so far")).toBeOnTheScreen();
  expect(screen.getByText("17 Nov, then it’s gone")).toBeOnTheScreen();
  expect(screen.getByText("Scan with any camera")).toBeOnTheScreen();
  expect(screen.getByText("QR")).toBeOnTheScreen();
  expect(screen.getByText("Stamp")).toBeOnTheScreen();
});

test("says a view-only envelope admits only that", async () => {
  await renderWithI18n(<RollEnvelope title="Nadia turns 30" peopleCount={1} admits="view" accessibilityLabel="x" />);

  expect(screen.getByText("Admits: view only")).toBeOnTheScreen();
  expect(screen.getByText("1 person so far")).toBeOnTheScreen();
});

test("prints dashes for what isn't known", async () => {
  await renderWithI18n(<RollEnvelope title="" accessibilityLabel="x" />);

  expect(screen.getAllByText("— — —")).toHaveLength(4);
});

test("stays blank and unticked while sealed, with no code", async () => {
  await renderWithI18n(
    <RollEnvelope title="Secret" peopleCount={3} admits="adds" sealed code={<Text>QR</Text>} accessibilityLabel="x" />,
  );

  expect(screen.queryByText("Secret")).not.toBeOnTheScreen();
  expect(screen.queryByText("3 people so far")).not.toBeOnTheScreen();
  expect(screen.queryByText("— — —")).not.toBeOnTheScreen();
  expect(screen.queryByText("QR")).not.toBeOnTheScreen();
  expect(screen.getByText("Sealed until you sign in")).toBeOnTheScreen();
});
