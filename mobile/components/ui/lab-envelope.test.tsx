import { render, screen } from "@testing-library/react-native";
import { LabEnvelope } from "./lab-envelope";

test("reads as one summary and prints the filled-in fields", async () => {
  await render(
    <LabEnvelope
      fields={[{ label: "Name", value: "Sam & Jo’s wedding" }]}
      options={[{ label: "Adds photos", checked: true }]}
      footer="Scan with any camera"
      accessibilityLabel="Invite to Sam and Jo’s wedding"
    />,
  );
  expect(screen.getByLabelText("Invite to Sam and Jo’s wedding")).toBeOnTheScreen();
  expect(screen.getByText("Sam & Jo’s wedding")).toBeOnTheScreen();
  expect(screen.getByText("Adds photos")).toBeOnTheScreen();
});

test("a sealed envelope leaves its fields blank", async () => {
  await render(<LabEnvelope fields={[{ label: "Name" }]} accessibilityLabel="Invite" />);
  expect(screen.getByText("Name")).toBeOnTheScreen();
});
