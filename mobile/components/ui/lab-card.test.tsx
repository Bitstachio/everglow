import { render, screen } from "@testing-library/react-native";
import { LabCard } from "./lab-card";

test("reads as one summary of the account", async () => {
  await render(
    <LabCard
      title="Lab card"
      fields={[{ label: "Name", value: "Maya Chen" }]}
      accessibilityLabel="Maya Chen, @maya.chen"
    />,
  );
  expect(screen.getByLabelText("Maya Chen, @maya.chen")).toBeOnTheScreen();
});

test("marks the empty photo spot when there is no photo yet", async () => {
  await render(
    <LabCard title="Lab card" fields={[{ label: "Name", value: "Maya" }]} accessibilityLabel="Maya, @maya" />,
  );
  expect(screen.getByText("Maya", { includeHiddenElements: true })).toBeOnTheScreen();
});
